<?php
// Proxy CardTrader : prix minimum CardTrader Zero par carte (clé = id Scryfall) pour une extension.
// GET /api/cardtrader.php?set=<code Scryfall>
// Le token est lu dans cardtrader-config.php, à placer AU-DESSUS de public_html (voir cardtrader-config.example.php).
declare(strict_types=1);

const CT_API = 'https://api.cardtrader.com/api/v2';
const MTG_GAME_ID = 1;
const PRICES_TTL = 6 * 3600;       // prix d'une extension
const EXPANSIONS_TTL = 24 * 3600;  // liste des extensions CardTrader

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $body): never
{
    http_response_code($status);
    header('Cache-Control: ' . ($status === 200 ? 'private, max-age=600' : 'no-store'));
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// cherche cardtrader-config.php en remontant depuis public_html/api
function loadConfig(): ?array
{
    $dir = __DIR__;
    for ($i = 0; $i < 5; $i++) {
        $dir = dirname($dir);
        $file = $dir . '/cardtrader-config.php';
        if (is_file($file)) {
            $cfg = require $file;
            return is_array($cfg) && !empty($cfg['token']) ? $cfg + ['config_dir' => $dir] : null;
        }
    }
    return null;
}

function cacheDir(array $cfg): string
{
    $dir = $cfg['cache_dir'] ?? $cfg['config_dir'] . '/cardtrader-cache';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) $dir = sys_get_temp_dir();
    return $dir;
}

function cacheGet(string $file, int $ttl): ?array
{
    if (!is_file($file) || time() - filemtime($file) > $ttl) return null;
    $data = json_decode((string)file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

function cachePut(string $file, array $data): void
{
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_SLASHES)) !== false) rename($tmp, $file);
}

function ct(array $cfg, string $path): array
{
    $ch = curl_init(($cfg['base_url'] ?? CT_API) . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $cfg['token'], 'Accept: application/json'],
    ]);
    for ($try = 0; ; $try++) {
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($code === 429 && $try < 2) { sleep(1); continue; } // limite de débit CardTrader
        break;
    }
    if ($body === false || $code >= 400) throw new RuntimeException("CardTrader HTTP $code sur $path");
    $json = json_decode($body, true);
    if (!is_array($json)) throw new RuntimeException("Réponse CardTrader illisible sur $path");
    return $json;
}

// code d'extension (minuscules) => ids d'extension CardTrader
function expansions(array $cfg, string $dir): array
{
    $file = "$dir/expansions.json";
    $map = cacheGet($file, EXPANSIONS_TTL);
    if ($map !== null) return $map;
    $map = [];
    foreach (ct($cfg, '/expansions') as $e) {
        if (($e['game_id'] ?? null) !== MTG_GAME_ID || empty($e['code'])) continue;
        $map[strtolower((string)$e['code'])][] = (int)$e['id'];
    }
    cachePut($file, $map);
    return $map;
}

function priceCents(array $p): ?int
{
    $c = $p['price_cents'] ?? $p['price']['cents'] ?? null;
    return is_numeric($c) ? (int)$c : null;
}

function setPrices(array $cfg, array $expansionIds): array
{
    $cards = [];
    $currency = null;
    foreach ($expansionIds as $expId) {
        $scryfall = []; // blueprint id => scryfall id
        foreach (ct($cfg, '/blueprints/export?expansion_id=' . $expId) as $bp) {
            if (!empty($bp['scryfall_id'])) $scryfall[(int)$bp['id']] = (string)$bp['scryfall_id'];
        }
        $products = ct($cfg, '/marketplace/products?expansion_id=' . $expId);
        if (array_is_list($products)) { // regroupe par blueprint si l'API renvoie une liste à plat
            $grouped = [];
            foreach ($products as $p) $grouped[(int)($p['blueprint_id'] ?? 0)][] = $p;
            $products = $grouped;
        }
        foreach ($products as $bpId => $list) {
            $sid = $scryfall[(int)$bpId] ?? null;
            if ($sid === null || !is_array($list)) continue;
            foreach ($list as $p) {
                $props = $p['properties_hash'] ?? [];
                if (empty($p['user']['can_sell_via_hub'])) continue; // vendeur non éligible CardTrader Zero
                if (!empty($p['graded']) || !empty($props['mtg_foil']) || !empty($props['signed']) || !empty($props['altered'])) continue;
                $cond = (string)($props['condition'] ?? '');
                $cents = priceCents($p);
                if ($cond === '' || $cents === null) continue;
                $currency ??= $p['price_currency'] ?? $p['price']['currency'] ?? null;
                $cur = $cards[$sid]['p'][$cond] ?? null;
                if ($cur === null || $cents < $cur) $cards[$sid]['p'][$cond] = $cents;
                $cards[$sid]['b'] = (int)$bpId;
            }
        }
    }
    return ['currency' => $currency ?? 'EUR', 'cards' => (object)$cards];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') reply(405, ['error' => 'method_not_allowed']);
$set = strtolower((string)($_GET['set'] ?? ''));
if (!preg_match('/^[a-z0-9]{2,8}$/', $set)) reply(400, ['error' => 'bad_set']);

$cfg = loadConfig();
if ($cfg === null) reply(503, ['error' => 'not_configured']);
$dir = cacheDir($cfg);

$file = "$dir/prices-$set.json";
$cached = cacheGet($file, PRICES_TTL);
if ($cached !== null) reply(200, $cached);

try {
    $ids = expansions($cfg, $dir)[$set] ?? [];
    $data = ['set' => $set, 'fetchedAt' => time() * 1000, 'matched' => (bool)$ids]
        + ($ids ? setPrices($cfg, $ids) : ['currency' => 'EUR', 'cards' => (object)[]]);
    cachePut($file, $data);
    reply(200, $data);
} catch (Throwable $e) {
    $stale = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    if (is_array($stale)) reply(200, $stale + ['stale' => true]);
    reply(502, ['error' => 'cardtrader', 'detail' => $e->getMessage()]);
}

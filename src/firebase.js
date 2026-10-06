import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCznNtazqWMhiYlPxce3O0Ss06mycgp6TY',
  authDomain: 'm2s-mtg.firebaseapp.com',
  projectId: 'm2s-mtg',
  storageBucket: 'm2s-mtg.firebasestorage.app',
  messagingSenderId: '760752938824',
  appId: '1:760752938824:web:92327fe6c051b8f2741d7d',
  measurementId: 'G-P42X9FJ6SF',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const provider = new GoogleAuthProvider()

// Cache local persistant : l'appli reste utilisable hors-ligne, les coches se synchronisent au retour du réseau
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut,
  type User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where
} from 'firebase/firestore';

// Environment variables or configured project credentials
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY || "AIzaSyAQ3HSJVBT2AfQpqfMzlT8DrqtKwaalASw",
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || "auracraft-app.firebaseapp.com",
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || "auracraft-app",
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || "auracraft-app.firebasestorage.app",
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "721352526956",
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID || "1:721352526956:web:189f71528ab3d890011c49"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Data Interfaces
export interface SocialLinks {
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  youtube?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'worker' | 'client';
  companyName?: string;
  niche?: string;
  phone?: string;
  photoURL?: string;
  description?: string;
  country?: string;
  city?: string;
  socials?: SocialLinks;
  createdAt: string;
}

export interface ClientRequest {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  type: 'video_viral' | 'paid_ads' | 'funnel_vsl' | 'branding_design' | 'otra';
  description: string;
  priority: 'alta' | 'media' | 'baja';
  status: 'pendiente' | 'en_proceso' | 'en_revision' | 'completado';
  assignedWorker: string;
  createdAt: string;
  dueDate?: string;
}

export interface ClientGoal {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  targetMetric: string;
  currentProgress: number; // 0 - 100
  status: 'en_progreso' | 'alcanzada' | 'revisando';
  targetDate: string;
  updatedAt: string;
}

// Translate authentication and database Error Codes into friendly Spanish messages
export function parseFirebaseError(error: any): string {
  if (!error) return 'Ocurrió un error inesperado.';
  const code = error.code || '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'Este correo electrónico ya está registrado. Por favor, inicia sesión con tu contraseña.';
    case 'auth/invalid-email':
      return 'El correo electrónico ingresado no tiene un formato válido.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/missing-email':
      return 'Por favor, ingresa tu correo electrónico.';
    case 'auth/user-not-found':
      return 'No se encontró ninguna cuenta registrada con este correo electrónico.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos. Verifica tus datos o crea una cuenta.';
    case 'auth/user-disabled':
      return 'Esta cuenta ha sido deshabilitada temporalmente.';
    case 'permission-denied':
      return 'No tienes permisos suficientes para realizar esta acción en el sistema.';
    default:
      return error.message || 'Error al comunicarse con el servidor de autenticación.';
  }
}

// Send Password Reset Email
export async function resetUserPassword(email: string): Promise<void> {
  if (!email || !email.trim()) {
    throw new Error('Por favor ingresa tu correo electrónico.');
  }

  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch (e: any) {
    console.error("Error sending password reset email:", e);
    throw new Error(parseFirebaseError(e));
  }
}

// Local Session Helpers
export function getActiveSession(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const session = localStorage.getItem('casanostra_active_user');
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

export function setActiveSession(user: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  if (!user) {
    localStorage.removeItem('casanostra_active_user');
  } else {
    localStorage.setItem('casanostra_active_user', JSON.stringify(user));
  }
}

// User Registration with real Firebase Auth & Firestore
export async function registerUserAccount(
  email: string, 
  pass: string, 
  displayName: string, 
  role: 'worker' | 'client',
  extra: { companyName?: string; niche?: string; phone?: string; inviteCode?: string }
): Promise<UserProfile> {
  // Validate invite code for Worker role
  if (role === 'worker') {
    if (!extra.inviteCode || extra.inviteCode.trim().toUpperCase() !== 'CASANOSTRA-TEAM') {
      throw new Error('Código de invitación de equipo no válido. Ingresa el código: CASANOSTRA-TEAM');
    }
  }

  let uid: string;
  try {
    const creds = await createUserWithEmailAndPassword(auth, email, pass);
    uid = creds.user.uid;
  } catch (authErr: any) {
    if (authErr.code === 'auth/email-already-in-use') {
      try {
        const creds = await signInWithEmailAndPassword(auth, email, pass);
        uid = creds.user.uid;
      } catch {
        throw new Error(parseFirebaseError(authErr));
      }
    } else {
      throw new Error(parseFirebaseError(authErr));
    }
  }

  try {
    const profile: UserProfile = {
      uid,
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      role,
      companyName: extra.companyName || (role === 'worker' ? 'Casanostra Staff' : 'Marca Personal'),
      niche: extra.niche || 'Marketing & Growth',
      phone: extra.phone || '',
      createdAt: new Date().toISOString()
    };

    // Store user profile document in Firestore
    await setDoc(doc(db, 'users', uid), profile);

    // Save active session locally
    setActiveSession(profile);

    return profile;
  } catch (e: any) {
    console.error("Error storing user profile in Firestore:", e);
    throw new Error(parseFirebaseError(e));
  }
}

// User Login with real Firebase Auth & Firestore
export async function loginUserAccount(email: string, pass: string): Promise<UserProfile> {
  try {
    const creds = await signInWithEmailAndPassword(auth, email, pass);
    const uid = creds.user.uid;

    // Fetch user profile from Firestore
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const profile = userSnap.data() as UserProfile;
      setActiveSession(profile);
      return profile;
    } else {
      // Fallback profile if user exists in Auth but not Firestore
      const fallbackProfile: UserProfile = {
        uid,
        email: creds.user.email || email,
        displayName: creds.user.displayName || email.split('@')[0],
        role: 'client',
        createdAt: new Date().toISOString()
      };
      await setDoc(userDocRef, fallbackProfile);
      setActiveSession(fallbackProfile);
      return fallbackProfile;
    }
  } catch (e: any) {
    console.error("Error logging in user with Firebase:", e);
    throw new Error(parseFirebaseError(e));
  }
}

export function logout(): void {
  signOut(auth).catch(() => {});
  setActiveSession(null);
}

// Fetch Requests from Firestore
export async function fetchRequests(user: UserProfile): Promise<ClientRequest[]> {
  try {
    const requestsRef = collection(db, 'requests');
    let q;

    if (user.role === 'worker') {
      q = query(requestsRef);
    } else {
      q = query(requestsRef, where('clientId', '==', user.uid));
    }

    const snapshot = await getDocs(q);
    const list: ClientRequest[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as ClientRequest);
    });

    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (e: any) {
    console.error("Error fetching requests from Firestore:", e);
    return [];
  }
}

// Create Request in Firestore
export async function addRequest(reqData: Omit<ClientRequest, 'id' | 'createdAt'>): Promise<ClientRequest> {
  try {
    const newReqPayload = {
      ...reqData,
      createdAt: new Date().toISOString().split('T')[0]
    };

    const docRef = await addDoc(collection(db, 'requests'), newReqPayload);
    return {
      id: docRef.id,
      ...newReqPayload
    };
  } catch (e: any) {
    console.error("Error adding request to Firestore:", e);
    throw new Error(parseFirebaseError(e));
  }
}

// Update Request Status in Firestore
export async function updateRequestStatus(reqId: string, status: ClientRequest['status']): Promise<void> {
  try {
    const reqRef = doc(db, 'requests', reqId);
    await updateDoc(reqRef, { status });
  } catch (e: any) {
    console.error("Error updating request status in Firestore:", e);
    throw new Error(parseFirebaseError(e));
  }
}

// Fetch Goals from Firestore
export async function fetchGoals(user: UserProfile): Promise<ClientGoal[]> {
  try {
    const goalsRef = collection(db, 'goals');
    let q;

    if (user.role === 'worker') {
      q = query(goalsRef);
    } else {
      q = query(goalsRef, where('clientId', '==', user.uid));
    }

    const snapshot = await getDocs(q);
    const list: ClientGoal[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as ClientGoal);
    });

    return list;
  } catch (e: any) {
    console.error("Error fetching goals from Firestore:", e);
    return [];
  }
}

// Add Goal in Firestore
export async function addGoal(goalData: Omit<ClientGoal, 'id' | 'updatedAt'>): Promise<ClientGoal> {
  try {
    const newGoalPayload = {
      ...goalData,
      updatedAt: new Date().toISOString().split('T')[0]
    };

    const docRef = await addDoc(collection(db, 'goals'), newGoalPayload);
    return {
      id: docRef.id,
      ...newGoalPayload
    };
  } catch (e: any) {
    console.error("Error adding goal to Firestore:", e);
    throw new Error(parseFirebaseError(e));
  }
}

// Update Goal Progress in Firestore
export async function updateGoalProgress(
  goalId: string, 
  currentProgress: number, 
  status: ClientGoal['status']
): Promise<void> {
  try {
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      currentProgress,
      status,
      updatedAt: new Date().toISOString().split('T')[0]
    });
  } catch (e: any) {
    console.error("Error updating goal progress in Firestore:", e);
    throw new Error(parseFirebaseError(e));
  }
}

// Fetch Real Registered Clients for Worker Dropdowns
export async function fetchRegisteredClients(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'client'));
    const snapshot = await getDocs(q);
    const clients: UserProfile[] = [];
    snapshot.forEach((docSnap) => {
      clients.push(docSnap.data() as UserProfile);
    });
    return clients;
  } catch (e) {
    console.error("Error fetching clients from Firestore:", e);
    return [];
  }
}

// Update User Profile in Firestore & Local Session
export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    
    let currentData: Partial<UserProfile> = {};
    if (userSnap.exists()) {
      currentData = userSnap.data() as UserProfile;
    }

    const updatedProfile: UserProfile = {
      ...currentData,
      ...updates,
      uid,
    } as UserProfile;

    await setDoc(userRef, updatedProfile, { merge: true });
    setActiveSession(updatedProfile);
    return updatedProfile;
  } catch (e: any) {
    console.error("Error updating user profile:", e);
    throw new Error(parseFirebaseError(e));
  }
}

// Fetch All User Profiles for Search Directory
export async function fetchAllProfiles(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    const profiles: UserProfile[] = [];
    snapshot.forEach((docSnap) => {
      profiles.push(docSnap.data() as UserProfile);
    });
    return profiles;
  } catch (e) {
    console.error("Error fetching all profiles from Firestore:", e);
    return [];
  }
}





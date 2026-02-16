
import React, { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import { User, UserRole } from './types';
import { Logo } from './components/Logo'; // Re-imported for fallback
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, db, doc, setDoc, getDoc} from './services/firebaseService';
import { ShieldCheck, UserCircle, ArrowLeft, Lock, Mail, Eye, EyeOff, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { TypeAnimation } from "react-type-animation";
type LoginStage = 'selection' | 'credentials';
type AuthMode = 'login' | 'signup';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [stage, setStage] = useState<LoginStage>('selection');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [logoError, setLogoError] = useState(false); // State to handle logo load failure

  // Mobile Back Button Navigation
  const prevAuthRef = useRef(false);
  useEffect(() => {
    const isCredentials = stage === 'credentials';
    
    if (isCredentials && !prevAuthRef.current) {
      window.history.pushState({ isAuthStage: true }, "");
    } else if (!isCredentials && prevAuthRef.current && window.history.state?.isAuthStage) {
      window.history.back();
    }

    const handlePopState = () => {
      if (stage === 'credentials') setStage('selection');
    };

    window.addEventListener("popstate", handlePopState);
    prevAuthRef.current = isCredentials;
    return () => window.removeEventListener("popstate", handlePopState);
  }, [stage]);

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as User;
            if (userData.status === 'UNVERIFIED') {
              setError("Account pending admin approval. Please wait for verification.");
              await signOut(auth);
            } else {
              setCurrentUser({ id: firebaseUser.uid, email: firebaseUser.email || '', ...userData });
            }
          } else {
            console.warn(`Firestore profile not found for UID: ${firebaseUser.uid}. Forcing logout.`);
            setError("Your profile data is missing. Please try signing up again.");
            await signOut(auth);
          }
        } catch (firestoreError) {
          console.error("Error fetching user profile from Firestore:", firestoreError);
          setError("Failed to load user profile. Please try again.");
          await signOut(auth);
        }
      } else {
        setCurrentUser(null);
      }
      setIsInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser && selectedRole) {
      const storedRole = currentUser.role;
      const isRoleValid = Array.isArray(storedRole)
        ? (storedRole as string[]).includes(selectedRole)
        : storedRole === selectedRole;

      if (!isRoleValid) {
        handleLogout();
        setError("Invalid credentials for selected role");
      }
    }
  }, [currentUser, selectedRole]);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setStage('credentials');
    setError(null);
  };

  const handleBack = () => {
    setStage('selection');
    setSelectedRole(null);
    setError(null);
    setPassword('');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setError(null);

    try {
      if (authMode === 'signup') {
        if (!fullName.trim()) throw new Error("Full name is required.");
        if (!selectedRole) throw new Error("User role must be selected.");
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        const newUser: User = { 
          id: uid, 
          email: email, 
          name: fullName, 
          role: selectedRole, 
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
          status: selectedRole === UserRole.ADMIN ? 'VERIFIED' : 'UNVERIFIED'
        };
        await setDoc(doc(db, 'users', uid), newUser);

        if (newUser.status === 'UNVERIFIED') {
          setError("Account created. Please wait for admin approval before logging in.");
          await signOut(auth);
        } else {
          setCurrentUser(newUser);
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const existingUser = userDocSnap.data() as User;
          
          if (existingUser.status === 'UNVERIFIED') {
            await signOut(auth);
            throw new Error("Account pending admin approval.");
          }

          // Verify role from Firestore matches selected UI role
          const storedRole = existingUser.role;
          const isRoleValid = Array.isArray(storedRole) 
            ? (storedRole as any[]).includes(selectedRole)
            : storedRole === selectedRole;

          if (!isRoleValid) {
            await signOut(auth);
            throw new Error("Invalid credentials");
          }

          setCurrentUser(existingUser);
        } else {
          await signOut(auth); 
          throw new Error("Your profile data is missing. Please sign up again.");
        }
      }
    } catch (err: any) {
      let errorMessage = "An unexpected error occurred.";
      if (err.message === "Invalid credentials") {
        errorMessage = "Invalid credentials";
      } else if (err.message === "Account pending admin approval.") {
        errorMessage = "Account pending admin approval.";
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = "User already exists. Please sign in";
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        errorMessage = "Email or password is incorrect";
      } else if (err.code === 'auth/weak-password') {
        errorMessage = "Password should be at least 6 characters.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error during logout:", err);
      setError("Failed to log out. Please try again.");
    }
  };

  if (isInitializing) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-[#20b384] animate-spin" />
        <p className="text-[#0F172A]/40 text-[10px] font-black tracking-[0.2em] uppercase animate-pulse">Initializing Portal...</p>
      </div>
    );
  }

  if (currentUser && selectedRole) {
    const isRoleValid = Array.isArray(currentUser.role)
      ? (currentUser.role as string[]).includes(selectedRole)
      : currentUser.role === selectedRole;

    if (isRoleValid) {
      return <Dashboard user={{ ...currentUser, role: selectedRole }} onLogout={handleLogout} />;
    }
  }

  return (
    <div className="min-h-screen bg-[url(https://drive.google.com/thumbnail?id=1zn30llLoJYTW3PpENoYDBKNnc_1nOiCv&sz=w1920)] bg-cover bg-center bg-no-repeat flex items-center justify-center p-4 ">
      <div className="bg-white shadow-2xl overflow-hidden max-w-5xl w-full flex flex-col md:flex-row min-h-[650px] border border-slate-100 fit-shadow">
        
        <div className="fit-gradient p-12 text-white md:w-5/12 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
             <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
               <path d="M0,50 L20,50 L25,30 L35,70 L40,50 L100,50" fill="none" stroke="white" strokeWidth="0.5" className="animate-[pulse_4s_ease-in-out_infinite]" />
             </svg>
          </div>
          
          <div className="relative z-10">
            {/* Branding side logo with error handling and fallback */}
            <div className="branding flex items-center justify-center gap-4 m-7 -mt-2">
              <img 
                src="https://drive.google.com/thumbnail?id=16XO82w7ZH4aMFYzHrTB-f5lKxFapwUw-&sz=w300" 
                alt="Fit Mantra Logo" 
                className="w-20 h-20 shadow-2xl object-contain bg-white rounded-full"
                onError={() => setLogoError(true)}
              />

              <div className="space-y-1">
                <h1 className="text-4xl font-black tracking-tight leading-none">
                  CallSense
                </h1>
                {/*<h2 className="text-xl font-bold tracking-tight text-[#20b384]">
                  ~Fit Mantra
                </h2>*/}
              </div>
            </div>

            
            {/*<p className="text-slate-300 text-lg leading-relaxed font-medium max-w-xs -mt-2">
              AI-driven conversation intelligence for the world's leading health professionals.
            </p>*/}
            <div className="min-h-[96px] -mt-2">
            <TypeAnimation
              sequence={[
                "AI-driven conversation intelligence for the world's leading health professionals.",
                300,
              ]}
              // Fix: Speed prop must be a number between 1 and 99 (50 is normal)
              speed={50}
              wrapper="p"
              repeat={0}
              className="text-slate-300 text-lg leading-relaxed font-medium max-w-xs -mt-2"
              cursor={false}
            />
          </div>
            
            <div className="mt-16 space-y-4">
              <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="p-2 bg-[#20b384]/20 rounded-lg">
                   <ShieldCheck className="w-5 h-5 text-[#20b384]" />
                </div>
                <span className="text-sm font-bold tracking-tight">Sales Quality Assurance</span>
              </div>
              <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                   <Sparkles className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm font-bold tracking-tight">Intelligent Call Auditing</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-10 md:p-20 md:w-7/12 flex flex-col justify-center bg-[#e4fff6]">
          {stage === 'selection' ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
              <h2 className="text-3xl font-black text-[#20b384] mb-2 tracking-tight">Access Portal</h2>
              <p className="text-[#0a716c] mb-12 font-medium">Select your workspace role to begin.</p>

              <div className="space-y-5">
                <button
                  onClick={() => handleRoleSelect(UserRole.ADMIN)}
                  className="w-full bg-[#F8FAFC] flex items-center p-6 border-2 border-slate-50 rounded-[2rem] hover:border-[#20b384]/30 transition-all group text-left fit-shadow"
                >
                  <div className="p-4 bg-white rounded-2xl group-hover:bg-[#0F172A] transition-colors mr-6">
                    <ShieldCheck className="w-8 h-8 text-[#0F172A] group-hover:text-[#20b384]" />
                  </div>
                  <div>
                    <p className="font-black text-[#0F172A] text-2xl">Administrator</p>
                    <p className="text-sm text-[#0a716c] font-semibold mt-1">Full access & knowledge control</p>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleSelect(UserRole.RESPONDER)}
                  className="w-full bg-[#F8FAFC] flex items-center p-6 border-2 border-slate-50 rounded-[2rem] hover:border-[#20b384]/30  transition-all group text-left fit-shadow"
                >
                  <div className="p-4 bg-[#F8FAFC] rounded-2xl group-hover:bg-[#0F172A] transition-colors mr-6">
                    <UserCircle className="w-8 h-8 text-[#0F172A] group-hover:text-[#20b384]" />
                  </div>
                  <div>
                    <p className="font-black text-[#0F172A] text-2xl">Sales | Dietitian</p>
                    <p className="text-sm text-[#0a716c] font-semibold mt-1">Live coaching & call auditing</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button onClick={handleBack} className="flex items-center gap-2 text-slate-400 hover:text-[#20b384] font-black text-xs uppercase tracking-widest mb-10 transition-colors group">
                <ArrowLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
                Return to Selection
              </button>
              
              <h2 className="text-4xl font-black text-[#0F172A] mb-2 tracking-tight">
                {authMode === 'login' ? 'Welcome Back' : 'Create Profile'}
              </h2>
              <p className="text-slate-400 font-bold text-sm uppercase tracking-[0.2em] mb-10">
                Authorizing <span className="text-[#0a716c]">{selectedRole}</span> Access
              </p>

              <form onSubmit={handleAuthSubmit} className="space-y-5">
                {authMode === 'signup' && (
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Account Holder Name</label>
                    <div className="relative">
                      <UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                      <input 
                        type="text" required placeholder="Enter full name"
                        className="w-full pl-14 pr-5 py-5 bg-[#F8FAFC] border-2 border-[#F8FAFC] rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-[#0F172A]"
                        value={fullName} onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Professional Email</label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                    <input 
                      type="email" required placeholder="name@fitmantra.com"
                      className="w-full pl-14 pr-5 py-5 bg-[#F8FAFC] border-2 border-[#F8FAFC] rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-[#0F172A]"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Security Password</label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                    <input 
                      type={showPassword ? "text" : "password"} required placeholder="password"
                      className="w-full pl-14 pr-14 py-5 bg-[#F8FAFC] border-2 border-[#F8FAFC] rounded-2xl focus:border-[#20b384] focus:bg-white outline-none transition-all font-semibold text-[#0F172A]"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#20b384]">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 text-[11px] font-bold rounded-xl flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isAuthenticating} 
                  className="w-full py-5 fit-button-gradient text-white rounded-[1.5rem] font-black text-lg fit-accent-shadow hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-3 mt-4"
                >
                  {isAuthenticating ? <Loader2 className="w-6 h-6 animate-spin" /> : (authMode === 'login' ? 'Authenticate' : 'Establish Profile')}
                </button>

                {selectedRole!="ADMIN"?(
                <div className="text-center mt-6">
                  <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-xs font-black text-[#20b384] hover:opacity-80 transition-opacity uppercase tracking-widest">
                    {authMode === 'login' ? "New to CallSense? Create Profile" : "Already registered? Authenticate"}
                  </button>
                </div>):<></>}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

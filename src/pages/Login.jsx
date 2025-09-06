import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { auth } from "../firebase";

function FloatingShapes() {
  return (
    <>
      {/* Floating abstract shapes */}
      <svg
        className="absolute left-10 top-1/4 w-24 h-24 opacity-20 animate-float"
        viewBox="0 0 200 200"
      >
        <path
          d="M50,100 Q100,50 150,100 T250,100"
          fill="none"
          stroke="#D6C7FF"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>

      <svg
        className="absolute right-8 bottom-1/3 w-20 h-20 opacity-20 animate-float-delay"
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="40" fill="#6C4AB6" fillOpacity="0.3" />
      </svg>

      {/* Decorative corner elements */}
      <svg
        className="absolute left-0 top-0 w-32 h-32 opacity-10"
        viewBox="0 0 100 100"
      >
        <path d="M0,0 L100,0 L0,100 Z" fill="#D6C7FF" />
      </svg>
    </>
  );
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [remember, setRemember] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem("rememberedEmail");
    if (saved) {
      setUsername(saved);
      setRemember(true);
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, username, password);
      if (remember) {
        localStorage.setItem("rememberedEmail", username);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
      setLoading(false);
      navigate("/dashboard");
    } catch (err) {
      setError("Invalid email or password");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center min-h-screen w-screen bg-gradient-to-br from-[#1c0450] via-[#8055f7] to-[#2a0c6e] px-4 sm:px-8 overflow-y-auto">
      <style>{`
  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(5deg); }
  }
  @keyframes float-delay {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-15px) rotate(-5deg); }
  }
`}</style>

      <FloatingShapes />

      <div className="relative flex flex-col md:flex-row items-center justify-center w-full max-w-4xl min-h-[600px] md:min-h-[550px] rounded-3xl bg-[#030a334d] border border-white/30 shadow-2xl backdrop-blur-2xl mx-2 my-6 sm:my-10 p-6 sm:p-10 gap-8 md:gap-0 overflow-hidden">
        {/* Left Side - Branding */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center md:justify-end mb-6 md:mb-0 pr-0 md:pr-10 relative z-10">
          <div className="w-32 h-32 mb-6 rounded-full flex items-center justify-center bg-[#030a33c0] border-2 border-[#6C4AB6] shadow-lg">
            <img
              className="w-28 h-28 rounded-full object-cover"
              src="https://static.vecteezy.com/system/resources/thumbnails/008/040/410/small_2x/school-logo-design-template-free-vector.jpg"
              alt="School Logo"
            />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl text-white font-extrabold text-center md:text-left leading-tight">
            Chosen <br /> Generation <br /> Academy
          </h1>
        </div>

        {/* Right Side - Login Form */}
        <div className="relative z-10 w-full md:w-1/2 max-w-md mx-auto p-6 sm:p-8 rounded-2xl shadow-2xl bg-[#030a3354] border border-white/50 backdrop-blur-lg">
          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-r from-[#6C4AB6] to-[#D6C7FF] flex items-center justify-center shadow-lg">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>

          <h2 className="text-center text-white font-bold text-xl mb-6 tracking-wide">
            Welcome Back!
          </h2>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <input
                type="email"
                placeholder="Email Address"
                value={username}
                autoComplete="email"
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg pl-10 pr-4 py-3 bg-white/90 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#6C4AB6] transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter") passwordRef.current?.focus();
                }}
                required
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <input
                ref={passwordRef}
                type={showPw ? "text" : "password"}
                placeholder="Password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg pl-10 pr-19 py-3 bg-white/90 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#6C4AB6] transition-all"
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center "
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? (
                  <EyeOff className="h-5 w-5 text-gray-500 hover:text-[#6C4AB6]" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-500 hover:text-[#6C4AB6]" />
                )}
              </button>
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 text-sm text-white select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-[#6C4AB6]"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center py-2 px-3 bg-red-900/30 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full mt-2 py-3 rounded-lg bg-gradient-to-r from-[#6C4AB6] to-[#9D79EE] text-white font-semibold text-lg hover:opacity-90 shadow-lg transition-all flex items-center justify-center gap-2 ${
                loading ? "opacity-80" : ""
              }`}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Logging in...
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

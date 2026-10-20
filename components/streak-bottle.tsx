// Bottle mark for the streak toast. Same artwork as public/brand/
// bottle-logo.svg, with two changes so it can animate: the logo's single
// outline path is split into body and cap pieces, and the cap (gold head
// plus its outline) sits in its own <g class="streak-cap"> so the press
// animation in globals.css can move it. The tiny built-in spray lines are
// dropped; the toast draws its own mist. Gradient ids are prefixed so they
// never collide with the nav's copy of the logo on the same page.
//
// Generated from the approved prototype (docs/build 2026-10-20); edit the
// SVG, not this file, if the mark changes, then regenerate.

export function StreakBottle() {
  return (
    <svg className="streak-bottle" width="59" height="73" viewBox="0 0 59 73" fill="none" aria-hidden>
    <path d="M18.25 14.3397H3.13C1.546 14.3397 0.25 15.6357 0.25 17.2197V69.0597C0.25 70.6437 1.546 71.9397 3.13 71.9397H54.97C56.554 71.9397 57.85 70.6437 57.85 69.0597V17.2197C57.85 15.6357 56.554 14.3397 54.97 14.3397H39.85H35.85H22.25H18.25Z" fill="url(#st-body)"/>
    <path d="M22.25 9.13965V14.3397H35.85V9.13965H29.05H22.25Z" fill="url(#st-neck)"/>
    <g className="streak-cap"><path d="M18.25 1.63965V9.13965H22.25H29.05H35.85H39.85V1.63965H29.35H18.25Z" fill="url(#st-cap)"/><path d="M29.05 9.13965H39.85V1.63965H29.35H18.25V9.13965H22.25M22.25 9.13965H29.05M18.25 9.13965H29.05M39.85 9.13965H35.85M35.85 9.13965H29.05"  stroke="#093616" strokeWidth="0.5" strokeLinecap="round"/></g>
    <path d="M22.25 9.13965V14.3397M22.25 14.3397H35.85M22.25 14.3397H18.25M18.25 14.3397H3.13C1.546 14.3397 0.25 15.6357 0.25 17.2197V69.0597C0.25 70.6437 1.546 71.9397 3.13 71.9397H54.97C56.554 71.9397 57.85 70.6437 57.85 69.0597V17.2197C57.85 15.6357 56.554 14.3397 54.97 14.3397H39.85M18.25 14.3397H29.05H39.85M39.85 14.3397H35.85M35.85 14.3397V9.13965"  stroke="#093616" strokeWidth="0.5" strokeLinecap="round"/>
    <path d="M28.234 31.2476C29.514 31.2476 30.602 31.4556 31.498 31.8716C32.394 32.2876 33.05 32.6716 33.466 33.0236C34.522 33.8876 35.162 33.3116 35.386 31.2956H36.49C36.426 32.1916 36.378 33.2636 36.346 34.5116C36.314 35.7276 36.298 37.3756 36.298 39.4556H35.194C35.002 38.2716 34.666 37.1196 34.186 35.9996C33.738 34.8796 33.066 33.9676 32.17 33.2636C31.274 32.5276 30.106 32.1596 28.666 32.1596C27.546 32.1596 26.602 32.4796 25.834 33.1196C25.098 33.7276 24.73 34.6396 24.73 35.8556C24.73 36.8156 25.018 37.6476 25.594 38.3516C26.17 39.0236 26.922 39.6636 27.85 40.2716C28.778 40.8476 29.786 41.4876 30.874 42.1916C32.09 42.9596 33.194 43.7436 34.186 44.5436C35.178 45.3436 35.962 46.2236 36.538 47.1836C37.146 48.1436 37.45 49.2796 37.45 50.5916C37.45 52.0636 37.066 53.2956 36.298 54.2876C35.53 55.2796 34.522 56.0316 33.274 56.5436C32.058 57.0556 30.714 57.3116 29.242 57.3116C28.538 57.3116 27.866 57.2476 27.226 57.1196C26.618 57.0236 26.026 56.8636 25.45 56.6396C25.13 56.4796 24.794 56.2876 24.442 56.0636C24.122 55.8396 23.802 55.5996 23.482 55.3436C23.162 55.0876 22.874 55.1036 22.618 55.3916C22.362 55.6476 22.17 56.1756 22.042 56.9756H20.938C21.002 55.9516 21.05 54.7036 21.082 53.2316C21.114 51.7596 21.13 49.8076 21.13 47.3756H22.234C22.458 49.1676 22.778 50.7356 23.194 52.0796C23.61 53.4236 24.266 54.4796 25.162 55.2476C26.058 55.9836 27.306 56.3516 28.906 56.3516C29.546 56.3516 30.186 56.2076 30.826 55.9196C31.498 55.6316 32.058 55.1516 32.506 54.4796C32.954 53.8076 33.178 52.9116 33.178 51.7916C33.178 50.3836 32.666 49.2316 31.642 48.3356C30.618 47.4396 29.322 46.4956 27.754 45.5036C26.602 44.7676 25.514 44.0316 24.49 43.2956C23.498 42.5596 22.682 41.7276 22.042 40.7996C21.434 39.8716 21.13 38.7516 21.13 37.4396C21.13 35.9996 21.45 34.8316 22.09 33.9356C22.762 33.0076 23.642 32.3356 24.73 31.9196C25.818 31.4716 26.986 31.2476 28.234 31.2476Z" fill="url(#st-s)"/>
    
    
    
    <defs>
    <linearGradient id="st-body" x1="0.25" y1="36.7897" x2="57.85" y2="36.7897" gradientUnits="userSpaceOnUse">
    <stop stopColor="#114821"/>
    <stop offset="0.298077" stopColor="#7AA78E"/>
    <stop offset="0.735577" stopColor="#266939"/>
    <stop offset="1" stopColor="#114821"/>
    </linearGradient>
    <linearGradient id="st-neck" x1="0.25" y1="36.7897" x2="57.85" y2="36.7897" gradientUnits="userSpaceOnUse">
    <stop offset="0.394231" stopColor="#D4AF37"/>
    <stop offset="0.461538" stopColor="white"/>
    <stop offset="0.600962" stopColor="#D4AF37"/>
    </linearGradient>
    <linearGradient id="st-cap" x1="0.25" y1="36.7897" x2="57.85" y2="36.7897" gradientUnits="userSpaceOnUse">
    <stop offset="0.341346" stopColor="#D4AF37"/>
    <stop offset="0.4375" stopColor="white"/>
    <stop offset="0.543269" stopColor="#D4AF37"/>
    </linearGradient>
    <linearGradient id="st-s" x1="18.25" y1="36.6396" x2="40.25" y2="36.6396" gradientUnits="userSpaceOnUse">
    <stop offset="0.0384615" stopColor="#D1D1D1"/>
    <stop offset="0.120192" stopColor="#E1E1E1"/>
    <stop offset="0.211538" stopColor="#FAF6ED"/>
    <stop offset="0.461538" stopColor="#E1E1E1"/>
    <stop offset="0.75" stopColor="#D1D1D1"/>
    </linearGradient>
    </defs>
    </svg>
  );
}

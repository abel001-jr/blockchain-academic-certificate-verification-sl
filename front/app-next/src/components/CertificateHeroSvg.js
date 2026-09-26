export default function CertificateHeroSvg() {
  return (
    <svg viewBox="0 0 480 330" xmlns="http://www.w3.org/2000/svg" className="w-full block" aria-hidden="true">
      <defs>
        <filter id="sealEmboss" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#08283F" floodOpacity="0.18" />
        </filter>
      </defs>
      <rect x="0" y="0" width="480" height="330" rx="4" fill="#FFFFFF" />
      <rect x="10" y="10" width="460" height="310" rx="2" fill="none" stroke="#E4E1D6" strokeWidth="1" />
      <line x1="10" y1="10" x2="470" y2="10" stroke="#08283F" strokeWidth="3" />

      <text x="34" y="46" fontFamily="Inter, sans-serif" fontSize="10" letterSpacing="0.5" fill="#4A5A68">
        CENTRAL UNIVERSITY SIERRA LEONE
      </text>
      <text x="34" y="72" fontFamily="Newsreader, Georgia, serif" fontSize="21" fill="#08283F" fontWeight="500">
        Bachelor of Science
      </text>
      <text x="34" y="96" fontFamily="Newsreader, Georgia, serif" fontSize="21" fill="#08283F" fontWeight="500">
        in Computer Science
      </text>

      <line x1="34" y1="118" x2="446" y2="118" stroke="#E4E1D6" strokeWidth="1" />

      <text x="34" y="144" fontFamily="Inter, sans-serif" fontSize="9" fill="#4A5A68">AWARDED TO</text>
      <text x="34" y="163" fontFamily="Newsreader, Georgia, serif" fontSize="17" fill="#1B2734" fontStyle="italic">
        Abel Morie Sam
      </text>

      <text x="34" y="192" fontFamily="Inter, sans-serif" fontSize="9" fill="#4A5A68">CERTIFICATE ID</text>
      <text x="34" y="208" fontFamily="Inter, sans-serif" fontSize="12" fill="#1B2734" fontWeight="600">
        CR-2026-CUSL-A3F92C01</text>

      <text x="34" y="234" fontFamily="Inter, sans-serif" fontSize="9" fill="#4A5A68">ISSUED</text>
      <text x="34" y="250" fontFamily="Inter, sans-serif" fontSize="12" fill="#1B2734" fontWeight="600">
        06 September 2026
      </text>

      <g filter="url(#sealEmboss)">
        <circle cx="404" cy="160" r="34" fill="none" stroke="#B98A28" strokeWidth="1.6" />
        <circle cx="404" cy="160" r="27" fill="none" stroke="#B98A28" strokeWidth="1" />
        <text x="404" y="156" fontFamily="Newsreader, Georgia, serif" fontSize="11" fill="#B98A28" textAnchor="middle" fontWeight="500">
          CUSL
        </text>
        <text x="404" y="169" fontFamily="Inter, sans-serif" fontSize="7" fill="#B98A28" textAnchor="middle" letterSpacing="1">
          SEAL
        </text>
      </g>

      <rect x="374" y="230" width="60" height="60" fill="#08283F" />
      <rect x="380" y="236" width="48" height="48" fill="#FFFFFF" />
      <rect x="386" y="242" width="10" height="10" fill="#08283F" />
      <rect x="412" y="242" width="10" height="10" fill="#08283F" />
      <rect x="386" y="268" width="10" height="10" fill="#08283F" />
      <rect x="400" y="256" width="8" height="8" fill="#08283F" />
      <rect x="414" y="270" width="8" height="8" fill="#08283F" />

      <line x1="34" y1="294" x2="446" y2="294" stroke="#E4E1D6" strokeWidth="1" />
      <circle cx="42" cy="305" r="3" fill="#2F6F4E" />
      <text x="52" y="309" fontFamily="Inter, sans-serif" fontSize="10" fill="#2F6F4E" fontWeight="600">
        Verified on chain
      </text>
    </svg>
  );
}

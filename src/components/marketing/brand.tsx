import Link from "next/link";

interface BrandProps {
  inverted?: boolean;
}

export function Brand({ inverted = true }: BrandProps) {
  return (
    <Link
      className="brand"
      data-inverted={inverted}
      href="/"
      aria-label="Zecceipt home"
    >
      <svg
        aria-hidden="true"
        className="brand__mark"
        viewBox="0 0 36 42"
        fill="none"
      >
        <path
          d="M4 2.5h28v34l-4.7-3.5-4.65 3.5L18 33l-4.65 3.5L8.7 33 4 36.5v-34Z"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M11.5 12h13L12 27h13"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
          strokeLinejoin="round"
        />
      </svg>
      <span>Zecceipt</span>
    </Link>
  );
}

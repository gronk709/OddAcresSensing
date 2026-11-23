import Link from "next/link";
import type { LocationOption } from "@/lib/types";

/** Plain links, so switching is a normal navigation and each location is bookmarkable. */
export default function LocationSwitcher({
  locations, selected,
}: {
  locations: LocationOption[];
  selected: string;
}) {
  return (
    <nav className="locations" aria-label="Apiary location">
      {locations.map((l) => (
        <Link
          key={l.id}
          href={`/?location=${l.slug}`}
          aria-current={l.id === selected ? "page" : undefined}
          scroll={false}
        >
          {l.name}
        </Link>
      ))}
    </nav>
  );
}

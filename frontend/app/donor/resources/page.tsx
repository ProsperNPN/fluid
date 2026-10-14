import {
  ExternalLink,
  HeartHandshake,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { PortalPanel } from "@/components/portal/portal-ui";

export default function ResourcesPage() {
  return (
    <div className="portal-stack">
      <PortalPanel title="Prepare for your donation journey">
        <div className="portal-resource-grid">
          <article>
            <ShieldCheck size={27} />
            <h2>Clinical screening comes first.</h2>
            <p>
              FLUID connects people and coordinates appointments. Your hospital
              determines donation suitability and confirms blood type through
              its screening process.
            </p>
          </article>
          <article>
            <MapPin size={27} />
            <h2>Keep your profile current.</h2>
            <p>
              Confirm your contact details, blood type, last donation date, and
              location. Use GPS only with your permission, or enter coordinates
              manually.
            </p>
            <Link href="/donor/profile">Update your profile</Link>
          </article>
          <article>
            <HeartHandshake size={27} />
            <h2>Donate on your terms.</h2>
            <p>
              Respond to a relevant request, agree an appointment with the
              hospital, and update your availability when your circumstances
              change.
            </p>
            <Link href="/donor/availability">Manage availability</Link>
          </article>
        </div>
      </PortalPanel>
      <PortalPanel title="Official donor information">
        <a
          className="portal-resource-link"
          href="https://www.who.int/campaigns/world-blood-donor-day/who-can-give-blood"
          target="_blank"
          rel="noopener noreferrer"
        >
          World Health Organization: Who can give blood{" "}
          <ExternalLink size={16} />
        </a>
        <a
          className="portal-resource-link"
          href="https://www.who.int/news-room/questions-and-answers/item/blood-products-why-should-i-donate-blood"
          target="_blank"
          rel="noopener noreferrer"
        >
          World Health Organization: Blood donation questions{" "}
          <ExternalLink size={16} />
        </a>
        <p className="portal-small-note">
          Selection criteria vary by country. Ask the receiving hospital about
          the locally approved requirements.
        </p>
      </PortalPanel>
    </div>
  );
}

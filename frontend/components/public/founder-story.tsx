import Link from 'next/link';
import { ArrowUpRight, Quote } from 'lucide-react';

export function FounderStory({ full = false }: { full?: boolean }) {
  return <section id="story" className="public-story public-section"><div className="public-container public-story__grid">
    <div><span className="public-eyebrow">THE REASON WE EXIST</span><h2>Built from Loss.<br /><span>Driven by the Hope<br />of Saving Lives.</span></h2><p className="public-story__origin">A personal beginning.<br />A purpose bigger than one person.</p></div>
    <div className="public-story__letter"><Quote size={32} strokeWidth={1.3} aria-hidden="true" /><p>When I was in junior high school, I lost my father because the blood he needed was not available at the hospital.</p><p>That experience left me with a question I couldn’t ignore: <em>Why should access to life-saving blood still depend on frantic phone calls and luck?</em></p><p>That question became one of the reasons I chose to study Computer Science.</p><p>FLUID grew from the belief that technology can help hospitals and donors connect more effectively, improve blood availability, and reduce the risk of other families experiencing a similar loss.</p><div className="public-story__signature"><span className="public-dot" /> The story behind FLUID</div>{!full && <Link className="public-text-link" href="/about">Learn Our Story <ArrowUpRight size={17} /></Link>}</div>
  </div></section>;
}

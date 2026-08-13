# Awin Publisher Application — Copy to Paste

Fill this in at awin.com. £5 refundable card verification, manual review in
roughly 24 hours. Application data is retained **60 days** before you can
resubmit after a rejection, so get it right the first time.

---

## Form settings (these matter more than the copy)

| Field | Use this | Why |
| --- | --- | --- |
| **Promotional type** | **Content** | Do NOT select "Search." Premium brands ban trademark PPC bidding and fragrance brands are exactly that type. Selecting Search causes instant denials. |
| **Primary region** | **United States** | Pick where the audience is. |
| **Email** | An address **@spritzofficial.app** | "Verifiable proof of domain ownership was not provided" is on Awin's published rejection list. A gmail address invites it. |
| **Name / address** | Must match WHOIS | "Name, address, or website that cannot be verified" is also on that list. |
| **Company name** | Your registered entity, or your legal name if sole proprietor | Don't invent one. |

**Before you submit**, make sure these three are live — I've built them, they
just need deploying:

- `/legal/privacy`
- `/legal/terms`
- `/legal/affiliate-disclosure`

They're linked from the footer on every page, which is where a reviewer looks.

---

## Business description

> Spritz is a fragrance reference library at spritzofficial.app. People scan a
> bottle with their phone camera or search by name, and get the full breakdown
> of what they're holding: the note pyramid, the perfumer who composed it,
> how long it lasts and how far it projects, which seasons and occasions it
> suits, the history of the house, and guidance on how to actually wear it.
>
> The catalog covers roughly 7,000 designer and niche fragrances, organised by
> note, house and olfactive family, with a saved collection so people can track
> what they own, what they've tried, and what they want next.
>
> The audience is people in the middle of a buying decision. Nobody opens a
> fragrance encyclopedia casually. They open it because they smelled something,
> or a bottle was recommended, or they're deciding whether a £120 purchase is
> worth it. That's the entire use case, which makes the traffic small but
> unusually far down the funnel.
>
> Revenue comes from a Pro subscription and from affiliate links out to
> retailers who stock the fragrance being viewed. Affiliate relationships are
> disclosed on every page and on a dedicated disclosure page.

---

## Promotional space description

This is the field Awin names directly in its rejection reasons ("promotional
space description lacks clarity or supporting content"). Use all of it.

> spritzofficial.app is a mobile-first fragrance library. Every fragrance has
> its own page with notes, perfumer, performance, wear guidance and house
> history, and those pages are reachable by scanning a bottle, searching, or
> browsing by note, house or family.
>
> Affiliate links appear in one place and one place only: a single "where to
> buy" call to action on a fragrance's own detail page, pointing to a retailer
> that stocks that specific bottle. There are no coupon feeds, no cashback, no
> pop-ups, no interstitials, no toolbar or extension, and no paid search. I do
> not bid on brand or trademark terms and have no intention of starting.
>
> Traffic is organic. People arrive from search engines looking up a specific
> fragrance by name, and from the scan feature inside the app. The site is new,
> so volume is modest and growing, and I'd rather tell you that than inflate a
> number you can check.
>
> What I'd bring to a fragrance retailer isn't volume, it's intent and
> coverage. A visitor on a Spritz fragrance page has already read the notes and
> the performance data and is deciding whether to buy that exact bottle. And
> because the catalog runs to roughly 7,000 fragrances rather than the few
> dozen a review blog covers, that includes a long tail of niche and
> discontinued releases that almost nothing else on the web indexes properly.
>
> I'm applying for product feed access specifically. Feed data lets me show the
> correct product image and current pricing alongside the buy link, which is
> what makes someone confident enough to click through.

---

## After approval — the first thing to do

1. **Fill out the Awin publisher profile immediately.** Network approval is not
   advertiser approval, and advertiser managers read that profile before
   deciding. Treat it as a media kit.
2. **Link Builder → "Not Joined"** to find the auto-join advertisers whose
   feeds you can use straight away under Awin's soft-membership rule.
3. **Toolbox → Links & Tools → Create-a-Feed**, and grab the API key out of any
   generated feed URL. Then pull:
   `https://productdata.awin.com/datafeed/list/apikey/{KEY}`
   Anything with `Membership Status = Not Joined` is already usable.
4. Apply to the six in `AWIN_TARGETS.md`: Douglas_DE (10076), Flaconi DE
   (14598), Fragrancedirect (9), allbeauty (911), Perfume Click (6561),
   Opulensi (123248).

**Feed build settings:** choose **Legacy**, not Enhanced (Enhanced has no
`aw_image_url`). Select `merchant_image_url`, `aw_image_url`, `aw_thumb_url`,
**`ean`**, `mpn`, `brand_name`, `product_name`, `size`, `search_price`,
`in_stock`, `aw_deep_link`, `aw_product_id`. Start with `compression/none`.

**Run English feeds before German ones.** allbeauty, Fragrancedirect and
Perfume Click ship English titles the matcher can parse, and every match now
teaches the catalog that product's barcode. Douglas_DE and Flaconi ship German
titles, and they match on those learned barcodes instead of the title. Running
them in the wrong order wastes most of the German catalog.

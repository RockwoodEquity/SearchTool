# Google Sheet copy of the Master Database

A Google Sheet that mirrors the Master Database and updates itself every 5 minutes. It is read-only in spirit:
the tabs are overwritten on every change, and keep / pass decisions stay in the app.

## What you get

- One tab per week, named `Week of M/D/YYYY` (the Monday), newest on the left. A company goes on the tab of the
  week it was sourced.
- Each tab is sorted by Add-On then Platform, then category, then for-sale before proprietary, then newest first.
- Columns: Type, Category, Mode, Company, Sourced by (email), Review, Website, Source, Location, Employees,
  Est. Revenue / Asking Price, Revenue / EBITDA Filter, Why it fits, Broker / Currently for sale?, Listing Date,
  Date Sourced, Contact, Already PE-owned?
- Website and Source cells are clickable links.
- Passed companies are greyed out; kept ones are green in the Review column.
- A `Sync info` tab on the far right shows when it last synced, or the error if it failed.
- Weeks run Monday to Sunday in US Eastern time. Set `SHEET_TIMEZONE` in Vercel to change it.

## One-time setup (about 3 minutes)

1. Create a blank Google Sheet in the Rockwood Google account and name it (for example "Rockwood Search Master").
2. Open **Extensions > Apps Script**. Delete the sample code, paste in all of `Code.gs`, and click **Save**.
3. Go back to the sheet and reload the page. A **Rockwood Search** menu appears.
4. **Rockwood Search > 1. Connect.** Press OK to keep the feed address, then paste the secret key.
5. **Rockwood Search > 2. Turn on automatic sync.** Google asks you to authorize the script once (Advanced >
   Go to project > Allow). It syncs immediately, then every 5 minutes.

## How it is protected

- The sheet reads `/api/sheet-feed`, which is not behind the sign-in (a script cannot sign in). It needs the
  secret key, sent in a request header, and answers 401 without it.
- The key is stored only in Vercel (`SHEET_FEED_KEY`) and in the script's private properties. Anyone who can
  edit the sheet's script can see the key, so share the sheet as viewer for everyone but the owner.
- To rotate the key: set a new `SHEET_FEED_KEY` in Vercel, redeploy, then use **1. Connect** again.

## Notes

- A company you remove with "Reset my results" also disappears from the sheet on the next sync. Passed
  companies stay (greyed out).
- If the feed returns no companies at all, the sheet is left alone instead of being wiped.
- Don't type into the weekly tabs: they are rewritten whenever that week's data changes.

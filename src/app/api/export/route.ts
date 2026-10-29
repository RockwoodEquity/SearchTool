import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { queryCompanies } from "@/lib/db";
import { isSearchType } from "@/lib/sectors";

export const runtime = "nodejs";

const COLUMNS: { header: string; key: string; width?: number }[] = [
  { header: "Mode", key: "mode" },
  { header: "Category", key: "category" },
  { header: "Company", key: "company" },
  { header: "Website", key: "website" },
  { header: "Source URL", key: "link_to_listing" },
  { header: "Location", key: "location" },
  { header: "Employees", key: "employees" },
  { header: "Est. Revenue / Asking Price", key: "revenue_or_price" },
  { header: "Revenue / EBITDA Filter", key: "search_filters" },
  { header: "Why it fits", key: "why_fits" },
  { header: "Broker/Source", key: "broker_source" },
  { header: "Listing Date", key: "listing_date" },
  { header: "Date Found", key: "date_found" },
  { header: "Contact", key: "contact" },
  { header: "Already PE-owned?", key: "pe_owned" },
  { header: "Review", key: "review" },
];

const MODE_LABEL: Record<string, string> = {
  for_sale: "For-Sale Listing",
  proprietary: "Proprietary Target",
};

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "addon";
  const start = req.nextUrl.searchParams.get("start") || undefined;
  const end = req.nextUrl.searchParams.get("end") || undefined;

  if (!isSearchType(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    // Passed rows are never exported.
    const rows = await queryCompanies(type, start, end, { includePassed: false });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(type === "platform" ? "Platform Search Results" : "Add-On Search Results");

    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key }));

    for (const row of rows) {
      sheet.addRow({
        mode: MODE_LABEL[row.mode] ?? row.mode,
        category: row.category,
        company: row.company,
        website: row.website ?? "",
        link_to_listing: row.link_to_listing ?? "",
        location: row.location ?? "",
        employees: row.employees ?? "",
        revenue_or_price: row.revenue_or_price ?? "",
        search_filters: row.search_filters ?? "",
        why_fits: row.why_fits ?? "",
        broker_source: row.broker_source ?? "",
        listing_date: row.listing_date ?? "",
        date_found: new Date(row.date_found).toLocaleString(),
        contact: row.contact ?? "",
        pe_owned: row.mode === "proprietary" ? row.pe_owned ?? "" : "",
        review: row.status === "kept" ? "Kept" : "",
      });
    }

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: COLUMNS.length },
    };

    sheet.columns.forEach((column, i) => {
      let maxLength = COLUMNS[i].header.length;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLength) maxLength = len;
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 60);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rockwood-${type}-search.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export" },
      { status: 500 }
    );
  }
}

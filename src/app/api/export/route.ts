import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { queryCompanies } from "@/lib/db";

export const runtime = "nodejs";

const COLUMNS: { header: string; key: string; width?: number }[] = [
  { header: "Mode", key: "mode" },
  { header: "Category", key: "category" },
  { header: "Company", key: "company" },
  { header: "Website", key: "website" },
  { header: "Link to Listing", key: "link_to_listing" },
  { header: "Location", key: "location" },
  { header: "Employees", key: "employees" },
  { header: "Est. Revenue / Asking Price", key: "revenue_or_price" },
  { header: "Why it fits", key: "why_fits" },
  { header: "Broker/Source", key: "broker_source" },
  { header: "Listing Date", key: "listing_date" },
  { header: "Date Found", key: "date_found" },
  { header: "Contact", key: "contact" },
  { header: "Already PE-owned?", key: "pe_owned" },
];

const MODE_LABEL: Record<string, string> = {
  for_sale: "For-Sale Listing",
  proprietary: "Proprietary Target",
};

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start") || undefined;
  const end = req.nextUrl.searchParams.get("end") || undefined;

  try {
    const rows = await queryCompanies(start, end);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Add-On Search Results");

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
        why_fits: row.why_fits ?? "",
        broker_source: row.broker_source ?? "",
        listing_date: row.listing_date ?? "",
        date_found: new Date(row.date_found).toLocaleString(),
        contact: row.contact ?? "",
        pe_owned: row.mode === "proprietary" ? row.pe_owned ?? "" : "",
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
        "Content-Disposition": `attachment; filename="rockwood-addon-search.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export" },
      { status: 500 }
    );
  }
}

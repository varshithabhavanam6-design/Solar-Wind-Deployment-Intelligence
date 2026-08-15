import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import {
  HiOutlineDocumentChartBar,
  HiOutlineArrowDownTray,
  HiOutlineTrash,
} from "react-icons/hi2";

import { getReports, deleteReport } from "../services/reportService";
import { useToast } from "../context/ToastContext";

import DashboardLayout from "../components/layout/DashboardLayout";
import Loader from "../components/ui/Loader";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import ConfirmDialog from "../components/ui/ConfirmDialog";

function formatDate(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function Reports() {
  const { showToast } = useToast();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getReports();
      setReports(data);
    } catch (err) {
      console.error(err);
      setError("Couldn't load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);

      await deleteReport(deleteTarget.id);

      showToast("Report deleted.");
      setDeleteTarget(null);

      loadReports();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete report.", "error");
    } finally {
      setDeleting(false);
    }
  };

  // Generate and download a real PDF containing the saved report data.
  const handleDownload = (report) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      const projectName = report.projectName || "Untitled Project";
      const siteName = report.siteName || "N/A";

      const value = (item, fallback = "N/A") => {
        if (item === null || item === undefined || item === "") return fallback;
        if (typeof item === "object") return JSON.stringify(item);
        return String(item);
      };

      const addPageIfNeeded = (height = 10) => {
        if (y + height > pageHeight - 18) {
          doc.addPage();
          y = 20;
        }
      };

      const addTitle = (title, size = 13) => {
        addPageIfNeeded(18);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(size);
        doc.setTextColor(15, 23, 42);
        doc.text(title, margin, y);
        y += size === 18 ? 10 : 8;
      };

      const addText = (label, data, indent = 0) => {
        const textValue = value(data);
        const lines = doc.splitTextToSize(
          `${label}: ${textValue}`,
          contentWidth - indent
        );

        addPageIfNeeded(lines.length * 5 + 5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, margin + indent, y);
        y += lines.length * 5 + 3;
      };

      const addSection = (title) => {
        y += 5;
        addPageIfNeeded(18);
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, y - 6, contentWidth, 11, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(title, margin + 4, y + 1);
        y += 12;
      };

      const addObject = (title, object) => {
        if (!object || typeof object !== "object") return;

        addSection(title);

        Object.entries(object).forEach(([key, item]) => {
          if (item === null || item === undefined || item === "") return;

          if (Array.isArray(item)) {
            addText(key, item.length ? item.join(", ") : "N/A");
          } else if (typeof item === "object") {
            addText(key, JSON.stringify(item));
          } else {
            addText(key, item);
          }
        });
      };

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text("Solar & Wind Deployment", margin, y);
      y += 8;

      doc.setFontSize(18);
      doc.text("Intelligence Platform", margin, y);
      y += 9;

      doc.setFontSize(13);
      doc.setFont("helvetica", "normal");
      doc.text("Site / Project Analysis Report", margin, y);
      y += 8;

      doc.setDrawColor(100, 116, 139);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;

      // Project information
      addSection("Project Information");
      addText("Project Name", projectName);
      addText("Site Name", siteName);
      addText("Report Type", report.type === "site-analysis" ? "Site Analysis" : "Project Summary");
      addText("Energy Type", report.energyType);
      addText("Region", report.region);
      addText("Number of Sites", report.siteCount);
      addText("Latitude", report.latitude);
      addText("Longitude", report.longitude);
      addText("Report Date", formatDate(report.createdAt));
      addText("Status", report.status);

      // Analysis data saved by SiteAnalysis.jsx
      addObject("Environmental Analysis", report.environmentalData);
      addObject("Terrain Analysis", report.terrainData);
      addObject("GIS Analysis", report.gisData);
      addObject("Solar Prediction", report.solarPrediction);
      addObject("Wind Prediction", report.windPrediction);
      addObject("Suitability Assessment", report.suitabilitySummary);

      // Notes and sources
      if (report.notes) {
        addSection("Notes");
        addText("Notes", report.notes);
      }

      if (report.sources && typeof report.sources === "object") {
        addSection("Data Sources");
        Object.entries(report.sources).forEach(([source, status]) => {
          addText(source, status);
        });
      }

      if (report.errors && typeof report.errors === "object" &&
          Object.keys(report.errors).length > 0) {
        addSection("Analysis Errors / Warnings");
        Object.entries(report.errors).forEach(([source, message]) => {
          addText(source, message);
        });
      }

      // Footer on every page
      const totalPages = doc.internal.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          "Generated by Solar & Wind Deployment Intelligence Platform",
          margin,
          pageHeight - 10
        );
        doc.text(
          `Page ${page} of ${totalPages}`,
          pageWidth - margin - 25,
          pageHeight - 10
        );
      }

      const safeName = projectName
        .replace(/[^a-z0-9]/gi, "_")
        .substring(0, 50);

      doc.save(`${safeName}_Report.pdf`);
      showToast("PDF report downloaded successfully.", "success");
    } catch (err) {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF report.", "error");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">

        <h1 className="text-4xl font-bold text-slate-900">
          Reports
        </h1>

        <p className="mt-3 text-slate-600">
          View and manage generated project and site analysis reports.
        </p>

        {loading && (
          <Loader label="Loading reports..." />
        )}

        {!loading && error && (
          <ErrorState
            message={error}
            onRetry={loadReports}
          />
        )}

        {!loading && !error && reports.length === 0 && (
          <EmptyState
            icon={HiOutlineDocumentChartBar}
            title="No Reports Yet"
            message={`Generate a report from a project's "Generate Report" button, or save a site analysis, to see it here.`}
          />
        )}

        {!loading && !error && reports.length > 0 && (
          <div className="mt-10 grid md:grid-cols-2 xl:grid-cols-3 gap-6">

            {reports.map((report) => (

              <div
                key={report.id}
                className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6"
              >

                <div className="flex items-center justify-between gap-3">

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      report.type === "site-analysis"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {report.type === "site-analysis"
                      ? "Site Analysis"
                      : "Project Summary"}
                  </span>

                  <span className="text-xs text-slate-400">
                    {formatDate(report.createdAt)}
                  </span>

                </div>

                <h2 className="mt-4 text-lg font-bold text-slate-900 truncate">
                  {report.projectName || "Untitled Project"}
                </h2>

                {report.siteName && (
                  <p className="text-sm text-slate-500 mt-1">
                    Site: {report.siteName}
                  </p>
                )}

                <div className="mt-4 space-y-1 text-sm text-slate-600">

                  {report.energyType && (
                    <p>
                      <span className="text-slate-400">
                        Type:
                      </span>{" "}
                      {report.energyType}
                    </p>
                  )}

                  {report.region && (
                    <p>
                      <span className="text-slate-400">
                        Region:
                      </span>{" "}
                      {report.region}
                    </p>
                  )}

                  {typeof report.siteCount === "number" && (
                    <p>
                      <span className="text-slate-400">
                        Sites:
                      </span>{" "}
                      {report.siteCount}
                    </p>
                  )}

                  {report.latitude !== undefined &&
                    report.latitude !== null && (
                      <p>
                        <span className="text-slate-400">
                          Coordinates:
                        </span>{" "}
                        {report.latitude}, {report.longitude}
                      </p>
                    )}

                </div>

                <div className="mt-6 flex gap-3">

                  <button
                    onClick={() => handleDownload(report)}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-blue-600 text-white py-2.5 rounded-xl transition-all duration-300 font-medium"
                  >
                    <HiOutlineArrowDownTray />
                    Download PDF
                  </button>

                  <button
                    onClick={() => setDeleteTarget(report)}
                    className="flex items-center justify-center gap-2 border border-red-200 hover:bg-red-50 text-red-600 px-4 py-2.5 rounded-xl transition-all duration-300 font-medium"
                  >
                    <HiOutlineTrash />
                  </button>

                </div>

              </div>

            ))}

          </div>
        )}

        {/* Report information */}
        <div className="mt-10 bg-white rounded-3xl shadow-lg p-8">

          <h2 className="text-2xl font-semibold">
            📄 Report Module
          </h2>

          <p className="mt-4 text-slate-600">
            Generated reports currently support PDF export.
          </p>

          <ul className="mt-5 list-disc pl-6 space-y-2 text-slate-700">
            <li>Solar Suitability Score</li>
            <li>Wind Suitability Score</li>
            <li>Environmental Analysis</li>
            <li>Terrain Analysis</li>
            <li>AI Recommendations</li>
            <li>PDF Export</li>
          </ul>

        </div>

      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this report?"
        message="This report will be permanently removed."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

    </DashboardLayout>
  );
}
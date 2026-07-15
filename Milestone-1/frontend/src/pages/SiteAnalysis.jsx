import { useEffect, useState } from "react";
import { HiOutlineMapPin, HiOutlineCheckCircle, HiOutlineXCircle } from "react-icons/hi2";

import { getProjects } from "../services/projectService";
import { getSites } from "../services/siteService";
import { createReport } from "../services/reportService";
import { runSiteAnalysis } from "../services/siteAnalysisService";
import { computeSuitability } from "../utils/suitability";
import { useAuth } from "../Authentication/AuthContext";
import { useToast } from "../context/ToastContext";

import DashboardLayout from "../components/layout/DashboardLayout";
import Loader from "../components/ui/Loader";
import EmptyState from "../components/ui/EmptyState";

export default function SiteAnalysis() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [notes, setNotes] = useState("");

  // Holds the last backend response so results can be displayed after saving.
  const [analysisResult, setAnalysisResult] = useState(null);
  // Rule-based suitability summary computed from that response — see
  // src/utils/suitability.js for the scoring logic.
  const [suitability, setSuitability] = useState(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadSites(selectedProjectId);
    } else {
      setSites([]);
    }
    setSelectedSiteId("");
    setLatitude("");
    setLongitude("");
    setAnalysisResult(null);
    setSuitability(null);
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      console.error(error);
      showToast("Couldn't load projects.", "error");
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadSites = async (projectId) => {
    try {
      setLoadingSites(true);
      const data = await getSites(projectId);
      setSites(data);
    } catch (error) {
      console.error(error);
      showToast("Couldn't load sites for this project.", "error");
    } finally {
      setLoadingSites(false);
    }
  };

  const handleSiteSelect = (siteId) => {
    setSelectedSiteId(siteId);
    setAnalysisResult(null);
    setSuitability(null);
    const site = sites.find((s) => s.id === siteId);

    if (site) {
      setLatitude(site.latitude ?? "");
      setLongitude(site.longitude ?? "");
    }
  };

  const handleSaveAnalysis = async (e) => {
    e.preventDefault();

    if (!selectedProjectId || !selectedSiteId || !latitude || !longitude) {
      showToast("Please select a project, a site, and enter coordinates.", "error");
      return;
    }

    const project = projects.find((p) => p.id === selectedProjectId);
    const site = sites.find((s) => s.id === selectedSiteId);

    try {
      setSaving(true);
      setAnalysisResult(null);
      setSuitability(null);

      // 1. Call the Python backend — fetches NASA POWER, elevation (SRTM),
      //    and OpenStreetMap data concurrently and combines the result.
      const result = await runSiteAnalysis({
        projectId: selectedProjectId,
        siteId: selectedSiteId,
        latitude: Number(latitude),
        longitude: Number(longitude),
      });

      setAnalysisResult(result);

      // 2. Compute a simple, rule-based suitability rating from that data —
      //    not machine learning, just transparent point-scoring (see
      //    src/utils/suitability.js). Uses the project's energyType to pick
      //    the right factor set (solar irradiance vs. wind speed).
      const suitabilityResult = computeSuitability(
        project?.energyType,
        result.environmentalData,
        result.terrainData,
        result.gisData
      );
      setSuitability(suitabilityResult);

      // 3. Save the combined analysis into the existing reports collection,
      //    using the nested shape: environmentalData / terrainData / gisData /
      //    sources / errors — matching the backend response structure directly.
      await createReport({
        type: "site-analysis",
        projectId: selectedProjectId,
        projectName: project?.projectName || "",
        siteId: selectedSiteId,
        siteName: site?.siteName || "",
        latitude: Number(latitude),
        longitude: Number(longitude),
        notes,
        createdBy: currentUser?.email || "Unknown",
        status: result.success ? "Analysis Complete" : "Partially Completed",

        environmentalData: result.environmentalData || {},
        terrainData: result.terrainData || {},
        gisData: result.gisData || {},
        sources: result.sources || {},
        errors: result.errors || {},
        suitabilitySummary: suitabilityResult,
      });

      if (result.success) {
        showToast("Analysis completed and saved successfully.");
      } else {
        showToast(
          "Analysis saved, but some data sources were unavailable — see details below.",
          "info"
        );
      }

      setNotes("");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Failed to save analysis.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
        <h1 className="text-4xl font-bold text-slate-900">Site Analysis</h1>
        <p className="mt-3 text-slate-600">
          Select a project and site to run a live environmental, terrain, and
          GIS analysis for that location.
        </p>

        {loadingProjects ? (
          <Loader label="Loading projects..." />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={HiOutlineMapPin}
            title="No Projects Available"
            message="Create a project first before running a site analysis."
          />
        ) : (
          <form
            onSubmit={handleSaveAnalysis}
            className="mt-10 bg-white rounded-3xl shadow-lg p-8 space-y-6"
          >
            <div>
              <label className="block font-medium mb-2 text-slate-700">
                Select Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                required
                className="w-full border rounded-lg p-3"
              >
                <option value="">-- Choose a project --</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectName} ({project.energyType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium mb-2 text-slate-700">
                Select Site
              </label>

              {loadingSites ? (
                <p className="text-slate-500 text-sm">Loading sites...</p>
              ) : (
                <select
                  value={selectedSiteId}
                  onChange={(e) => handleSiteSelect(e.target.value)}
                  required
                  disabled={!selectedProjectId || sites.length === 0}
                  className="w-full border rounded-lg p-3 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {selectedProjectId
                      ? sites.length === 0
                        ? "No sites found for this project"
                        : "-- Choose a site --"
                      : "Select a project first"}
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.siteName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-2 text-slate-700">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  required
                  className="w-full border rounded-lg p-3"
                />
              </div>

              <div>
                <label className="block font-medium mb-2 text-slate-700">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  required
                  className="w-full border rounded-lg p-3"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium mb-2 text-slate-700">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-lg p-3"
                placeholder="Any observations about this location..."
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Running Analysis..." : "Save Analysis"}
            </button>
          </form>
        )}

        {/* Results panel — only appears after a successful backend call */}
        {analysisResult && (
          <div className="mt-8 bg-white rounded-3xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-slate-900">
              Analysis Results
            </h2>

            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Solar Irradiance</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {analysisResult.environmentalData?.solarIrradiance ?? "—"}
                  <span className="text-sm font-normal text-slate-500 ml-1">
                    kWh/m²/day
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Temperature</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {analysisResult.environmentalData?.temperature ?? "—"}
                  <span className="text-sm font-normal text-slate-500 ml-1">
                    °C
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Wind Speed</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {analysisResult.environmentalData?.windSpeed ?? "—"}
                  <span className="text-sm font-normal text-slate-500 ml-1">
                    m/s
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Elevation</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {analysisResult.terrainData?.elevation ?? "—"}
                  <span className="text-sm font-normal text-slate-500 ml-1">
                    m
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-5 grid sm:grid-cols-3 gap-5 text-sm">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-slate-500">Nearby Roads</p>
                <p className="font-semibold text-slate-900">
                  {analysisResult.gisData?.roadCount ?? 0} found
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-slate-500">Power Infrastructure</p>
                <p className="font-semibold text-slate-900">
                  {analysisResult.gisData?.powerInfrastructureCount ?? 0} found
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-slate-500">Water Bodies</p>
                <p className="font-semibold text-slate-900">
                  {analysisResult.gisData?.waterBodyCount ?? 0} found
                </p>
              </div>
            </div>

            {/* Land Use — only rendered when the backend returned tags */}
            {analysisResult.gisData?.landUse?.length > 0 && (
              <div className="mt-5">
                <p className="text-sm text-slate-500 mb-2">Land Use Nearby</p>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.gisData.landUse.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Per-source status, so partial failures are visible, not hidden */}
            <div className="mt-6 flex flex-wrap gap-3">
              {Object.entries(analysisResult.sources || {}).map(([source, status]) => (
                <span
                  key={source}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    status === "success"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {status === "success" ? (
                    <HiOutlineCheckCircle />
                  ) : (
                    <HiOutlineXCircle />
                  )}
                  {source}: {status}
                </span>
              ))}
            </div>

            {analysisResult.errors && Object.keys(analysisResult.errors).length > 0 && (
              <p className="mt-3 text-sm text-slate-500">
                {Object.values(analysisResult.errors).join(" ")}
              </p>
            )}
          </div>
        )}

        {/* Suitability Summary — simple rule-based scoring, not ML.
            See src/utils/suitability.js for the point system. */}
        {suitability && (
          <div className="mt-8 bg-white rounded-3xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-slate-900">
              Suitability Summary
            </h2>

            <div className="mt-5 flex items-center gap-4 flex-wrap">
              <span
                className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold ${
                  suitability.level === "High Potential"
                    ? "bg-green-100 text-green-700"
                    : suitability.level === "Moderate Potential"
                    ? "bg-yellow-100 text-yellow-700"
                    : suitability.level === "Low Potential"
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {suitability.level}
              </span>

              {suitability.maxScore > 0 && (
                <span className="text-sm text-slate-500">
                  Score: {suitability.score} / {suitability.maxScore}
                </span>
              )}
            </div>

            <ul className="mt-5 space-y-2">
              {suitability.reasons.map((reason, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs text-slate-400">
              This is a simple rule-based estimate using the environmental,
              terrain, and GIS data above — not a machine learning
              prediction. A learned suitability model is planned for a
              later milestone.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

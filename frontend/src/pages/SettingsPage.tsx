import { useEffect, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import {
  fetchWeights,
  updateWeight,
  deleteWeight,
  fetchThresholds,
  updateThresholds,
  fetchEscalationRules,
  updateEscalationRule,
  fetchSystemConfig,
  updateSystemConfig,
} from "../services/api";

export function SettingsPage() {
  const [weights, setWeights] = useState<any>(null);
  const [thresholds, setThresholds] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [sysConfig, setSysConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [newCategory, setNewCategory] = useState("");
  const [newMode, setNewMode] = useState<"physical" | "online">("physical");
  const [newWeightVal, setNewWeightVal] = useState(50);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [w, t, r, c] = await Promise.all([
        fetchWeights(),
        fetchThresholds(),
        fetchEscalationRules(),
        fetchSystemConfig(),
      ]);
      setWeights(w);
      setThresholds(t);
      setRules(r);
      setSysConfig(c);
    } catch (err: any) {
      setMessage("Failed to load: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function showMsg(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleWeightChange(mode: string, category: string, weight: number) {
    try {
      await updateWeight({ mode, category, weight });
      showMsg(`${category} → ${weight}`);
      const w = await fetchWeights();
      setWeights(w);
    } catch (err: any) {
      showMsg("Error: " + err.message);
    }
  }

  async function handleToggleWeight(mode: string, category: string, active: boolean) {
    try {
      await updateWeight({ mode, category, active });
      const w = await fetchWeights();
      setWeights(w);
    } catch (err: any) {
      showMsg("Error: " + err.message);
    }
  }

  async function handleDeleteWeight(id: string) {
    try {
      await deleteWeight(id);
      showMsg("Deleted");
      const w = await fetchWeights();
      setWeights(w);
    } catch (err: any) {
      showMsg("Error: " + err.message);
    }
  }

  async function handleAddWeight() {
    if (!newCategory.trim()) return;
    try {
      await updateWeight({
        mode: newMode,
        category: newCategory.trim().toLowerCase().replace(/\s+/g, "_"),
        weight: newWeightVal,
      });
      showMsg("Added");
      setNewCategory("");
      const w = await fetchWeights();
      setWeights(w);
    } catch (err: any) {
      showMsg("Error: " + err.message);
    }
  }

  async function handleThresholdSave() {
    try {
      await updateThresholds({
        global_high: thresholds.threat_high_min,
        global_medium: thresholds.threat_medium_max,
        global_low: thresholds.threat_low_max,
      });
      showMsg("Thresholds saved");
    } catch (err: any) {
      showMsg("Error: " + err.message);
    }
  }

  async function handleRuleToggle(id: string, active: boolean) {
    try {
      await updateEscalationRule(id, { active });
      const r = await fetchEscalationRules();
      setRules(r);
    } catch (err: any) {
      showMsg("Error: " + err.message);
    }
  }

  async function handleConfigUpdate(key: string, value: any) {
    try {
      await updateSystemConfig(key, value);
      showMsg(`${key} updated`);
      const c = await fetchSystemConfig();
      setSysConfig(c);
    } catch (err: any) {
      showMsg("Error: " + err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[11px] text-[#999] uppercase tracking-wider">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {message && (
        <div className="px-3 py-2 rounded bg-[#111] border border-[#333] text-[11px] text-[#aaa]">
          {message}
        </div>
      )}

      {/* Threat Weights */}
      <Section title="Threat Weights">
        {weights &&
          (["physical", "online"] as const).map((mode) => (
            <div key={mode} className="space-y-2 mb-4">
              <h4 className="text-[10px] uppercase tracking-[0.15em] text-[#ccc] font-bold">
                {mode}
              </h4>
              {Object.entries(weights[mode] || {}).map(
                ([category, info]: [string, any]) => (
                  <div
                    key={category}
                    className="flex items-center gap-3 bg-[#111] rounded px-3 py-2.5 border border-[#2a2a2a]"
                  >
                    <input
                      type="checkbox"
                      checked={info.active}
                      onChange={(e) => handleToggleWeight(mode, category, e.target.checked)}
                      className="rounded accent-white w-3.5 h-3.5"
                    />
                    <span className="text-xs text-[#ccc] w-36 truncate">
                      {category.replace(/_/g, " ")}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={info.weight}
                      onChange={(e) => handleWeightChange(mode, category, parseInt(e.target.value))}
                      className="flex-1 accent-white h-1"
                    />
                    <span className="text-xs font-mono text-[#aaa] w-7 text-right">
                      {info.weight}
                    </span>
                    <button
                      onClick={() => handleDeleteWeight(info.id)}
                      className="text-[#ccc] hover:text-white p-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
            </div>
          ))}

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#333]">
          <select
            value={newMode}
            onChange={(e) => setNewMode(e.target.value as any)}
            className="px-2 py-1.5 rounded bg-[#111] border border-[#333] text-[11px] text-[#aaa] focus:outline-none"
          >
            <option value="physical">Physical</option>
            <option value="online">Online</option>
          </select>
          <input
            type="text"
            placeholder="Category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded bg-[#111] border border-[#333] text-xs text-white placeholder:text-[#666] focus:outline-none focus:border-[#555]"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={newWeightVal}
            onChange={(e) => setNewWeightVal(parseInt(e.target.value) || 0)}
            className="w-14 px-2 py-1.5 rounded bg-[#111] border border-[#333] text-xs text-white focus:outline-none focus:border-[#555]"
          />
          <button
            onClick={handleAddWeight}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-white text-black text-[11px] font-bold hover:bg-[#ddd] transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </Section>

      {/* Thresholds */}
      <Section title="Global Thresholds">
        {thresholds && (
          <div className="space-y-4">
            <ThresholdRow
              label="High (score >=)"
              value={thresholds.threat_high_min ?? 70}
              onChange={(v) => setThresholds({ ...thresholds, threat_high_min: v })}
            />
            <ThresholdRow
              label="Medium (score >)"
              value={thresholds.threat_medium_max ?? 40}
              onChange={(v) => setThresholds({ ...thresholds, threat_medium_max: v })}
            />
            <ThresholdRow
              label="Low (score >)"
              value={thresholds.threat_low_max ?? 20}
              onChange={(v) => setThresholds({ ...thresholds, threat_low_max: v })}
            />
            <button
              onClick={handleThresholdSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-white text-black text-xs font-bold hover:bg-[#ddd] transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        )}
      </Section>

      {/* Escalation Rules */}
      <Section title="Escalation Rules">
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-3 bg-[#111] rounded px-3 py-2.5 border border-[#2a2a2a]"
            >
              <input
                type="checkbox"
                checked={rule.active}
                onChange={(e) => handleRuleToggle(rule.id, e.target.checked)}
                className="rounded accent-white w-3.5 h-3.5"
              />
              <span className="text-xs text-white font-bold uppercase">
                {rule.rule_type}
              </span>
              <span className="text-[11px] text-[#ccc] font-mono flex-1">
                {JSON.stringify(rule.config)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* System Config */}
      <Section title="System Configuration">
        <div className="space-y-2">
          {[
            { key: "MODEL_NAME", type: "text" },
            { key: "VIDEO_CHUNK_SECONDS", type: "number" },
            { key: "MAX_VIDEO_CONTEXT", type: "number" },
            { key: "MAX_IMAGE_CONTEXT", type: "number" },
            { key: "MAX_CONCURRENT_JOBS", type: "number" },
          ].map(({ key, type }) => (
            <div
              key={key}
              className="flex items-center gap-3 bg-[#111] rounded px-3 py-2.5 border border-[#2a2a2a]"
            >
              <span className="text-[11px] text-[#ccc] font-mono w-44 shrink-0">
                {key}
              </span>
              <input
                type={type}
                defaultValue={sysConfig[key] ?? ""}
                onBlur={(e) => {
                  const val = type === "number" ? parseInt(e.target.value) || 0 : e.target.value;
                  handleConfigUpdate(key, val);
                }}
                className="flex-1 px-2 py-1 rounded bg-[#0a0a0a] border border-[#333] text-xs text-white focus:outline-none focus:border-[#555]"
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#333] bg-[#0a0a0a] p-5">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#ccc] mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ThresholdRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#aaa] w-36">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="flex-1 accent-white h-1"
      />
      <span className="text-xs font-mono text-white w-7 text-right">{value}</span>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import MessageEnvelope from "@shared/types/express-types/message-envelope";
import SelectBox from "@shared/ui-components/form/select-box";
import { useFormManager } from "@shared/ui-hooks/form/useFormManager";
import ApiError from "@shared/types/error-types/api-error";

const CreationSimulatorPage: React.FC = () => {
  const { loading, error, submitForm } = useFormManager();
  const [formPostSelectRaceClassResult, setFormPostSelectRaceClassResult] = useState<MessageEnvelope | null>(null);
  // Form Options
  const [selectClassOptions, setSelectClassOptions] = useState<{ [key: string]: string }>({});
  const [selectRaceOptions, setSelectRaceOptions] = useState<{ [key: string]: string }>({});
  // Form Selections
  const [selectedClassOption, setSelectedClassOption] = useState<string>("");
  const [selectedRaceOption, setSelectedRaceOption] = useState<string>("");

  // Fetch classes on component mount.
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await fetch("/web-server/classes/get-classes");
        const data = await response.json();
        const options = data.payload.reduce((acc: { [key: string]: string }, className: string) => {
          acc[className] = className;
          return acc;
        }, {});
        setSelectClassOptions(options);
      } catch (error) {
        console.error("Error fetching classes:", error);
      }
    };

    fetchClasses();
  }, []);

  // Fetch races on component mount.
  useEffect(() => {
    const fetchRaces = async () => {
      try {
        const response = await fetch("/web-server/races/get-races");
        console.log("response", response);
        const data = await response.json();
        const options = data.payload.reduce((acc: { [key: string]: string }, raceName: string) => {
          acc[raceName] = raceName;
          return acc;
        }, {});
        setSelectRaceOptions(options);
      } catch (error) {
        console.error("Error fetching races:", error);
      }
    };

    fetchRaces();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormPostSelectRaceClassResult(null);

    // Build the payload including the selected option.
    const payload = {
      characterClass: selectedClassOption,
      characterRace: selectedRaceOption
    };

    try {
      const data = await submitForm<MessageEnvelope>("/web-server/character/simulators/creation", payload);
      setFormPostSelectRaceClassResult(data);
    } catch (err: any) {
      const apiError = err as ApiError;
      if(apiError?.statusCode === 400) {
        err
      }
      console.error("Submission error:", err);
    }
  };

  return (
    <div>
      <h1>Creation Simulator</h1>
      {error && <p style={{ color: "red" }}>{`Encountered Error: ${error}`}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginTop: "1rem" }}>
          <label htmlFor="characterClass">Character Class:</label>
          <SelectBox
            id="characterClass"
            name="characterClass"
            options={selectClassOptions}
            theme="light"
            placeholder="Select a class..."
            onSelectChange={(value) => setSelectedClassOption(value)}
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <label htmlFor="characterRace">Character Race:</label>
          <SelectBox
            id="characterRace"
            name="characterRace"
            options={selectRaceOptions}
            theme="light"
            placeholder="Select a race..."
            onSelectChange={(value) => setSelectedRaceOption(value)}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>
      {formPostSelectRaceClassResult && (
        <div>
          <h2>Response:</h2>
          <pre>{JSON.stringify(formPostSelectRaceClassResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default CreationSimulatorPage;

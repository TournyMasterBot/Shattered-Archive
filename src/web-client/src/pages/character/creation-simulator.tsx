import React, { useEffect, useState } from "react";
import MessageEnvelope from "@shared/types/express-types/message-envelope";
import SelectBox from "@shared/ui-components/form/select-box";
import { useFormManager } from "@shared/ui-hooks/form/useFormManager";

const CreationSimulatorPage: React.FC = () => {
  const { csrfToken, loading, error, submitForm } = useFormManager();
  const [result, setResult] = useState<MessageEnvelope | null>(null);
  const [selectedClassOption, setSelectedClassOption] = useState<string>("");
  const [selectedRaceOption, setSelectedRaceOption] = useState<string>("");
  const [selectClassOptions, setSelectClassOptions] = useState<{ [key: string]: string }>({});
  const [selectRaceOptions, setSelectRaceOptions] = useState<{ [key: string]: string }>({});

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
    setResult(null);
    
    // Extract characterName from the form.
    const formElements = event.currentTarget.elements as any;
    const characterName = (formElements.namedItem("characterName") as HTMLInputElement).value;
    
    // Build the payload including the selected option.
    const payload = {
      characterName,
      characterClass: selectedClassOption,
      characterRace: selectedRaceOption
    };

    try {
      // Use submitForm from our form manager.
      const data = await submitForm<MessageEnvelope>("/web-server/character/simulators/creation", payload);
      setResult(data);
    } catch (err) {
      console.error("Submission error:", err);
    }
  };

  return (
    <div>
      <h1>Creation Simulator</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="characterName">Character Name:</label>
          <input type="text" id="characterName" name="characterName" required />
        </div>
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
        <button type="submit" disabled={loading || !csrfToken}>
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>
      {result && (
        <div>
          <h2>Response:</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default CreationSimulatorPage;

import React, { useEffect, useState } from "react";
import SelectBox from "@shared/ui-components/form/select-box";
import { useFormManager } from "@shared/ui-hooks/form/useFormManager";
import ApiError from "@shared/types/error-types/api-error";
import CharacterCreationForm from "./character-creation-form";
import IDslClass from "@shared/types/character-types/dslClass";
import IRace from "@shared/types/character-types/race-interface";

const CreationSimulatorPage: React.FC = () => {
  const { loading, error, submitForm } = useFormManager();
  const [formPostSelectRaceClassResult, setFormPostSelectRaceClassResult] = useState<any | null>(null);
  // Form Options
  const [selectClassOptions, setSelectClassOptions] = useState<{ [key: string]: string }>({});
  const [selectRaceOptions, setSelectRaceOptions] = useState<{ [key: string]: string }>({});
  // Form Selections
  const [selectedClassOption, setSelectedClassOption] = useState<string>("");
  const [selectedRaceOption, setSelectedRaceOption] = useState<string>("");

  const [cpModifier, setCpModifier] = useState<number>(1.0);

  let selectedDslClass: IDslClass | undefined;
  let selectedDslRace: IRace | undefined;

  // Fetch classes on component mount.
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await submitForm("/web-server/classes/get-classes", "GET");
        const data = await response;
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
        const response = await submitForm("/web-server/races/get-races", "GET");
        console.log("response", response);
        const data = await response;
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

  const handleRaceClassSelectionSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormPostSelectRaceClassResult(null);

    // Build the payload including the selected option.
    const payload = {
      characterClass: selectedClassOption,
      characterRace: selectedRaceOption
    };

    let result: any = {};
    try {
      const classData = await submitForm(`/web-server/classes/get-class/${payload.characterClass}`, "get");
      result.classData = classData.payload;
      selectedDslClass = classData.payload;
    } catch (err: any) {
      const apiError = err as ApiError;
      if(apiError?.statusCode === 400) {
        err
      }
      console.error("Submission error:", err);
    }

    try {
      const raceData = await submitForm(`/web-server/races/get-race/${payload.characterRace}`, "get");
      selectedDslRace = raceData.payload;
      const modifier = selectedDslClass?.cpRacialModifiers[selectedDslRace!.name] ?? 1.0;
      console.log("Dsl Class, race", {
        dslClass: selectedDslClass,
        race: selectedDslRace,
        modifier: modifier
      });
      console.log("Modifier", {
        modifier
    });
      setCpModifier(modifier ?? 1.0)
    } catch (err: any) {
      const apiError = err as ApiError;
      if(apiError?.statusCode === 400) {
        err
      }
      console.error("Submission error:", err);
    }

    setFormPostSelectRaceClassResult(result);
  };

  return (
    <div>
      <h1>Creation Simulator</h1>
      {error && <p style={{ color: "red" }}>{`Encountered Error: ${error}`}</p>}
      <form onSubmit={handleRaceClassSelectionSubmit}>
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
          {/* Render the CharacterCreationForm if classData is available */}
          {formPostSelectRaceClassResult.classData && (
            <CharacterCreationForm racialModifier={cpModifier ?? 1.0} data={
              formPostSelectRaceClassResult.classData
            } />
          )}
          <pre>{JSON.stringify(formPostSelectRaceClassResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default CreationSimulatorPage;

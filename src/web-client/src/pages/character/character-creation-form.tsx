import MessageEnvelope from "@shared/types/express-types/message-envelope";
import { useFormManager } from "@shared/ui-hooks/form/useFormManager";
import React, { useEffect, useState } from "react";

interface CharacterCreationFormProps {
  racialModifier: number;
  data: {
    characterCreationAbilityGroups: {
      [key: string]: {
        cpCost: number;
        abilityGroup: {
          abilities: Array<{ name: string }>;
        };
      };
    };
    characterCreationSkills: { [key: string]: number };
  };
}

const CharacterCreationForm: React.FC<CharacterCreationFormProps> = ({ racialModifier, data }) => {
  const { characterCreationAbilityGroups, characterCreationSkills } = data;
  const { loading, error, submitForm } = useFormManager();
  // State for selected ability groups, skills, and running total.
  const [selectedAbilityGroups, setSelectedAbilityGroups] = useState<Record<string, boolean>>({});
  const [selectedSkills, setSelectedSkills] = useState<Record<string, boolean>>({});
  const [total, setTotal] = useState(0);
  const [tnl, setTnl] = useState(1000);

  // Toggle an ability group.
  const toggleAbilityGroup = (groupName: string) => {
    const group = characterCreationAbilityGroups[groupName];
    if (!group) return;

    const isSelected = !!selectedAbilityGroups[groupName];

    if (isSelected) {
      // Deselect group: subtract only the group cpCost,
      // and unselect associated skills (without subtracting individual cost)
      setTotal((prev) => prev - group.cpCost);
      setSelectedAbilityGroups((prev) => {
        const newSelection = { ...prev };
        delete newSelection[groupName];
        return newSelection;
      });
      if (group.abilityGroup && group.abilityGroup.abilities) {
        group.abilityGroup.abilities.forEach((ability) => {
          const skillName = ability.name;
          if (selectedSkills[skillName]) {
            setSelectedSkills((prev) => {
              const newSkills = { ...prev };
              delete newSkills[skillName];
              return newSkills;
            });
          }
        });
      }
    } else {
      // Select group: add only the group's cpCost
      // and mark associated skills as selected (without adding individual cost)
      setTotal((prev) => prev + group.cpCost);
      setSelectedAbilityGroups((prev) => ({ ...prev, [groupName]: true }));
      if (group.abilityGroup && group.abilityGroup.abilities) {
        group.abilityGroup.abilities.forEach((ability) => {
          const skillName = ability.name;
          if (!selectedSkills[skillName]) {
            setSelectedSkills((prev) => ({ ...prev, [skillName]: true }));
          }
        });
      }
    }
  };

  // Toggle an individual skill.
  const toggleSkill = (skillName: string) => {
    const isSelected = !!selectedSkills[skillName];
    const skillCost = characterCreationSkills[skillName] || 0;
    if (isSelected) {
      setSelectedSkills((prev) => {
        const newSkills = { ...prev };
        delete newSkills[skillName];
        return newSkills;
      });
      setTotal((prev) => prev - skillCost);
    } else {
      setSelectedSkills((prev) => ({ ...prev, [skillName]: true }));
      setTotal((prev) => prev + skillCost);
    }
  };

  // For a given skill, find which selected ability groups include it.
  const getGroupsForSkill = (skillName: string): string[] => {
    return Object.keys(selectedAbilityGroups).filter((groupName) => {
      const group = characterCreationAbilityGroups[groupName];
      return (
        group && group.abilityGroup && group.abilityGroup.abilities && group.abilityGroup.abilities.some((ability) => ability.name === skillName)
      );
    });
  };

  const clearAllSelections = () => {
    setSelectedAbilityGroups({});
    setSelectedSkills({});
    setTotal(0);
  };

  useEffect(() => {
    // Define an async function to call the endpoint.
    const fetchSimulator = async () => {
      try {
        const payload = {
          cpCost: total,
          racialModifier: racialModifier,
        };
        const data = await submitForm<MessageEnvelope>("/web-server/character/simulators/creation", "post", payload);
        const tnl = data?.payload?.racialModifiedTnl;
        if (tnl !== undefined) {
          setTnl(tnl);
        }

        // You can log or handle the response as needed.
        console.log("Simulator result:", data);
      } catch (err: any) {
        console.error("Submission error:", err);
      }
    };

    // Invoke the function when total changes.
    fetchSimulator();
  }, [total]);

  return (
    <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #ccc" }}>
      <h3>CP Cost: {total}</h3>
      <h3>{tnl} tnl</h3>
      <h2>Ability Groups</h2>
      <button onClick={clearAllSelections}>Clear All Selections</button>
      <ul style={{ listStyleType: "none", paddingLeft: 0 }}>
        {Object.keys(characterCreationAbilityGroups).map((groupName) => {
          const group = characterCreationAbilityGroups[groupName];
          return (
            <li key={groupName}>
              <label>
                <input type="checkbox" checked={!!selectedAbilityGroups[groupName]} onChange={() => toggleAbilityGroup(groupName)} />
                {groupName} (Cost: {group.cpCost})
              </label>
            </li>
          );
        })}
      </ul>

      <h2>Skills</h2>
      <ul style={{ listStyleType: "none", paddingLeft: 0 }}>
        {Object.keys(characterCreationSkills).map((skillName) => {
          const cost = characterCreationSkills[skillName];
          const groupsForSkill = getGroupsForSkill(skillName);
          return (
            <li key={skillName}>
              <label>
                <input type="checkbox" checked={!!selectedSkills[skillName]} onChange={() => toggleSkill(skillName)} />
                {skillName} (Cost: {cost})
                {groupsForSkill.length > 1 && (
                  <span style={{ fontStyle: "italic", marginLeft: "0.5rem", cursor: "help" }} title={`Included in: ${groupsForSkill.join(", ")}`}>
                    ({groupsForSkill.length} groups)
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default CharacterCreationForm;

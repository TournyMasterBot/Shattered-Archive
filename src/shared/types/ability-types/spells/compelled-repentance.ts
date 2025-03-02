import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CompelledRepentance implements IAbility {
  private static instance: CompelledRepentance;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Compelled Repentance'
COMPPELLED REPENTANCE

Syntax: cast 'compelled repentance' <target>

This spell compels the target to repent and reflect on their past actions, potentially causing them to hesitate in their next move.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CompelledRepentance.instance === undefined) {
      CompelledRepentance.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CompelledRepentance {
    if (!CompelledRepentance.instance) {
      CompelledRepentance.instance = new CompelledRepentance();
    }
    return CompelledRepentance.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CompelledRepentance.GetInstance() as T;
  }
}

export default CompelledRepentance;

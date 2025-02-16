import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DivineIntervention implements IAbility {
  private static instance: DivineIntervention;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Divine Intervention";
    this.helpFile = `
divine intervention
Syntax: cast 'divine intervention' <target>

Divine intervention allows a priest to lower the magical ability of its
victim, causing their casting to be of less power than normal.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DivineIntervention.instance === undefined) {
      DivineIntervention.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DivineIntervention {
    if (!DivineIntervention.instance) {
      DivineIntervention.instance = new DivineIntervention();
    }
    return DivineIntervention.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DivineIntervention.GetInstance() as T;
  }
}

export default DivineIntervention;

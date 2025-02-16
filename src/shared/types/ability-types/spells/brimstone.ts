import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Brimstone implements IAbility {
  private static instance: Brimstone;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Brimstone";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
`;

    if (Brimstone.instance === undefined) {
      Brimstone.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Brimstone {
    if (!Brimstone.instance) {
      Brimstone.instance = new Brimstone();
    }
    return Brimstone.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Brimstone.GetInstance() as T;
  }
}

export default Brimstone;

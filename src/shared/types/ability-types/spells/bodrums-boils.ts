import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BodrumsBoils implements IAbility {
  private static instance: BodrumsBoils;

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
    this.name = "Bodrums Boils";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `

`;

    if (BodrumsBoils.instance === undefined) {
      BodrumsBoils.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BodrumsBoils {
    if (!BodrumsBoils.instance) {
      BodrumsBoils.instance = new BodrumsBoils();
    }
    return BodrumsBoils.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BodrumsBoils.GetInstance() as T;
  }
}

export default BodrumsBoils;

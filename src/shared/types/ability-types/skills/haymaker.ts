import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Haymaker implements IAbility {
  private static instance: Haymaker;

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
    this.name = "Haymaker";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = ``;

    this.manualDescription = `Big huge swing. Fun if it lands, may put you on your own drunken ass if it don't.`;

    if (Haymaker.instance === undefined) {
      Haymaker.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Haymaker {
    if (!Haymaker.instance) {
      Haymaker.instance = new Haymaker();
    }
    return Haymaker.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Haymaker.GetInstance() as T;
  }
}

export default Haymaker;

import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Headbutt implements IAbility {
  private static instance: Headbutt;

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
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `headbutt
Headbutting is a skill which has been perfected by the Battleragers. 
It's been told that only a Battlerager that is in a total state of rage can
headbutt effectively. On top of causing the victim extreme discomfort it's
been rumored that a skilled rager can _sometimes_ knock a victim out cold if
hit correctly.`;

    if (Headbutt.instance === undefined) {
      Headbutt.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Headbutt {
    if (!Headbutt.instance) {
      Headbutt.instance = new Headbutt();
    }
    return Headbutt.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Headbutt.GetInstance() as T;
  }
}

export default Headbutt;

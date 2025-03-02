import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Mountaineering implements IAbility {
  private static instance: Mountaineering;

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
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = ``;

    if (Mountaineering.instance === undefined) {
      Mountaineering.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Mountaineering {
    if (!Mountaineering.instance) {
      Mountaineering.instance = new Mountaineering();
    }
    return Mountaineering.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Mountaineering.GetInstance() as T;
  }
}

export default Mountaineering;

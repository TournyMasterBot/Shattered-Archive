import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CallToArms implements IAbility {
  private static instance: CallToArms;

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
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Call to Arms - A high pitched tune that when perfectly performed by 
the Skald during battle, can deal physical damage upon its enemies and 
potentially deafen a single target.
`;
    this.manualDescription = "Damage your enemies and a chance to deafen them";

    if (CallToArms.instance === undefined) {
      CallToArms.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CallToArms {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CallToArms.GetInstance() as T;
  }
}

export default CallToArms;

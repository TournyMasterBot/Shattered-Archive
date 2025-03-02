import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class OceanCall implements IAbility {
  private static instance: OceanCall;

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
    this.helpFile = `OCEAN CALL

Syntax:  Ocean

Legends tell of the close ties between the ocean and those close to it. A
swashbuckler can call to the ocean for aid in providing him transportation. 
Perhaps it will answer ....  

Groups containing this skill:  Swashbuckler

SEE ALSO:  SWASHBUCKLER`;

    if (OceanCall.instance === undefined) {
      OceanCall.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): OceanCall {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return OceanCall.GetInstance() as T;
  }
}

export default OceanCall;

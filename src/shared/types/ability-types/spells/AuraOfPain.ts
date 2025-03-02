import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AuraOfPain implements IAbility {
  private static instance: AuraOfPain;

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
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
AURA OF PAIN

Syntax: cast 'aura of pain'

When casting this spell upon oneself, the battlemage will automatically
retaliate and deliver low damage per strike when facing any physical attacks
from their opponent.  

Groups containing this spell: Battlemagic

SEE ALSO:  BATTLEMAGE, BATTLEMAGIC

Updated 03.19.2021
`;

    if (AuraOfPain.instance === undefined) {
      AuraOfPain.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AuraOfPain {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AuraOfPain.GetInstance() as T;
  }
}

export default AuraOfPain;

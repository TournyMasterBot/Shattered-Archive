import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Kakute implements IAbility {
  private static instance: Kakute;

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
    this.helpFile = `KAKUTE

Syntax: Kakute <target>

Of the many subtle arts of the ninja, prominent among them is the art of
poisoning. Ninjas, having learned the poisoner's trade, possess a set of
poisoned knuckle-rings, which can be used to inject a target with a
weakening poison that saps the strength of its victim. This technique is a
swift one, meant to be used in the heat of battle to gain the upper hand.

SEE ALSO:  NINJA`;

    if (Kakute.instance === undefined) {
      Kakute.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Kakute {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Kakute.GetInstance() as T;
  }
}

export default Kakute;

import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BlindFighting implements IAbility {
  private static instance: BlindFighting;

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
    this.helpFile = `help 'blind fighting'
blind fighting
BLIND FIGHTING
Under the tutelage of a master weaponsmaster, the dedicated combatant can
learn how to utilize his weapons so effectively in combat that he is
proficient with them even while blinded.  The blind fighting skill negates
the disadvantages of losing vision in a fight by magic or smoke.  A wide
variety of classes and reclasses may learn this fighting technique.`;

    if (BlindFighting.instance === undefined) {
      BlindFighting.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BlindFighting {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BlindFighting.GetInstance() as T;
  }
}

export default BlindFighting;

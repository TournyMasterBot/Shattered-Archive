import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Meditation implements IAbility {
  private static instance: Meditation;

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
    this.helpFile = `help Meditation
MEDITATION
This skill is similar to fast healing, but relies on the concentration and
mantras to increase mana recovery when the character is sleeping or resting.
Thieves and warriors, with their troubled minds and violent attitudes, have
much trouble learning to meditate.`;

    if (Meditation.instance === undefined) {
      Meditation.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Meditation {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Meditation.GetInstance() as T;
  }
}

export default Meditation;

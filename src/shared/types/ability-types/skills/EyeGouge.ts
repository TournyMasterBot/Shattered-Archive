import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class EyeGouge implements IAbility {
  private static instance: EyeGouge;

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
    this.helpFile = `EYE GOUGE

The need to slow an opponent, to cause them enough pain to weaken their
skills, is a primary concern to a charlatan in battle. Thus, they use a
tactic of trickery known as gouging the eyes as a part of their repertoire
of skills.

A charlatan may attempt to gouge the eyes of an opponent at many times
during battle. If successful, the opponent's eyes tear up, and they are
unable to act as efficiently with their weapons while engaged in combat.

See also : Help Charlatan`;

    if (EyeGouge.instance === undefined) {
      EyeGouge.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EyeGouge {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EyeGouge.GetInstance() as T;
  }
}

export default EyeGouge;

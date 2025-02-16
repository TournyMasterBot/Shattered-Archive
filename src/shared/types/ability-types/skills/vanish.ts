import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Vanish implements IAbility {
  private static instance: Vanish;

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
    this.name = "Vanish";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `VANISH
Syntax: vanish
Vanish is an advanced assassin skill that lets the assassin disappear from a
room, with the assistance of a smoke bomb.  The assassin has no control over
which room he runs to under the smoke cover.`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Vanish {
    if (!Vanish.instance) {
      Vanish.instance = new Vanish();
    }
    return Vanish.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Vanish.GetInstance() as T;
  }
}

export default Vanish;

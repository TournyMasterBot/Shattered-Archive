import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AnimateObject implements IAbility {
  private static instance: AnimateObject;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Animate Object";
    this.helpFile = `
ANIMATE OBJECT

Syntax: cast 'animate object' <object>

Animate object allows the enchantor to bring ordinary objects to life in
order to aid them along their ways. There are many factors which determine
the usefulness of an animation.

When the enchantor is done with an animation he/she can DISMISS them.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
  }
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;

  // Method to get the single instance of the class
  public static GetInstance(): AnimateObject {
    if (!AnimateObject.instance) {
      AnimateObject.instance = new AnimateObject();
    }
    return AnimateObject.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AnimateObject.GetInstance() as T;
  }
}

export default AnimateObject;

import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Swim implements IAbility {
  private static instance: Swim;

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
    this.name = "Swim";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help swim
swim
SWIM

The swim skill determines your ability to swim underwater or in the ocean. 
Being unable to swim will result in you attempting to breathe water, which
will hurt you.  Everyone can swim, though some have more trouble with it
than others.  This skill is passive, and does not need to be invoked in
order to function. `;
    if (Swim.instance === undefined) {
      Swim.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Swim {
    if (!Swim.instance) {
      Swim.instance = new Swim();
    }
    return Swim.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Swim.GetInstance() as T;
  }
}

export default Swim;

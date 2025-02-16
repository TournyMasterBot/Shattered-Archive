import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Parry implements IAbility {
  private static instance: Parry;

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
    this.name = "Parry";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help Parry
PARRY
If at first you fail to dodge, block it.  Parry is useful for deflecting 
attacks, and is successful more often than dodge.  Parry requires a weapon for
full success, the hand-to-hand skill may also be used, but results in reduced
damage instead of no damage.  The best chance of parrying occurs when the
defender is skilled in both his and his opponent's weapon type.`;

    if (Parry.instance === undefined) {
      Parry.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Parry {
    if (!Parry.instance) {
      Parry.instance = new Parry();
    }
    return Parry.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Parry.GetInstance() as T;
  }
}

export default Parry;

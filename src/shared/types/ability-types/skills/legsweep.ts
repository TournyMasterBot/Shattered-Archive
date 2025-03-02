import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Legsweep implements IAbility {
  private static instance: Legsweep;

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
    this.helpFile = `help Legsweep
mastery spear spin impale legsweep
Mastery of the Spear
 
None are more adept in combat with a spear than an armsman versed in the
mastery of the spear. These armsmen can employ the following skills:
 
spin           An instinctive method of keeping distance between the armsman
               and their opponent while using spears.
impale         This savage attack pierces the opponent and impales them
               for massive damage.
legsweep       A knock-down attack with a spear to damage and take the legs
               out from under a foe.
 
This group is available to the following classes: ARMSMAN`;

    if (Legsweep.instance === undefined) {
      Legsweep.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Legsweep {
    if (!Legsweep.instance) {
      Legsweep.instance = new Legsweep();
    }
    return Legsweep.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Legsweep.GetInstance() as T;
  }
}

export default Legsweep;

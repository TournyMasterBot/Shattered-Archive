import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Dodge implements IAbility {
  private static instance: Dodge;

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
    this.name = "Dodge";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help dodge
DODGE
In the words of one wise warrior, 'the best way to block a blow is to not
be where it lands'.  The dodge skill honors this tradition, by improving the
character's natural agility to the point where many blows will miss the 
target. The chance of dodging is also affected by the dexterity of the
attacker and the target.  Any class may learn dodging.`;

    if (Dodge.instance === undefined) {
      Dodge.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Dodge {
    if (!Dodge.instance) {
      Dodge.instance = new Dodge();
    }
    return Dodge.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Dodge.GetInstance() as T;
  }
}

export default Dodge;

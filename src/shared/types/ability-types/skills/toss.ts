import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Toss implements IAbility {
  private static instance: Toss;

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
    this.helpFile = `
help toss
toss
Syntax: toss gourd <target>
Syntax: toss stake <target>
The toss skill allows a witch to throw a gourd potion through the air
and into the face of an opponent. If successful the gourd shatters on
the enemy and delivers its effects. A witch may also toss special
sharpened stakes, which are made with the splinter spell.
These can pierce the target with devastating effect if thrown
accurately.  Toss is always an aggressive action, regardless of gourd.`;

    this.manualDescription = "";
  }

  // Method to get the single instance of the class
  public static GetInstance(): Toss {
    if (!Toss.instance) {
      Toss.instance = new Toss();
    }
    return Toss.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Toss.GetInstance() as T;
  }
}

export default Toss;

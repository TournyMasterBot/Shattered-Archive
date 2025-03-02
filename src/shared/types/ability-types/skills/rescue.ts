import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Rescue implements IAbility {
  private static instance: Rescue;

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
    this.helpFile = `help rescue
FLEE RESCUE
FLEE RESCUE
Syntax: flee
Syntax: rescue   <character>
Once you start a fight, you can't just walk away from it.  If the fight
is not going well, you can attempt to FLEE, or another character can
RESCUE you.  (You can also RECALL, but this is less likely to work,
and costs more experience points, then fleeing).
If you lose your link during a fight, then your character will keep
fighting, and will attempt to RECALL from time to time.  Your chances
of making the recall are reduced, and you will lose much more experience.

RESCUE
A friend in need is a friend indeed.  And when in combat, a warrior with
the rescue skill is just the friend you need.  Rescue allows you to intercede
in combat, protecting weaker characters from bodily harm. Hopefully the
favor will be returned.  Success in rescuing depends on the skill rating, as
well as a comparison of level, dexterity, and speed between the character and
the target. (note: you rescue a friend, not the monster)`;
    if (Rescue.instance === undefined) {
      Rescue.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Rescue {
    if (!Rescue.instance) {
      Rescue.instance = new Rescue();
    }
    return Rescue.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Rescue.GetInstance() as T;
  }
}

export default Rescue;

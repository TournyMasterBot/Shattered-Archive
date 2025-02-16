import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Riding implements IAbility {
  private static instance: Riding;

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
    this.name = "Riding";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help Riding
RIDING RIDE MOUNT DISMOUNT
Syntax:  ride <mob>
         ride <player>
         dismount
         mount
RIDE is the command used to ride a mob or player (dragon) who are able and
willing to transport you.  DISMOUNT will allow you to stop riding.  When you dismount, you resume a standing position.  You must have the riding skill to 
be able to ride.
MOUNT is a dragon/beastformed shaman only command and toggles between allowing
other players to ride you or not. At the moment there is no way to remove someone
who is riding you.`;

    if (Riding.instance === undefined) {
      Riding.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Riding {
    if (!Riding.instance) {
      Riding.instance = new Riding();
    }
    return Riding.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Riding.GetInstance() as T;
  }
}

export default Riding;

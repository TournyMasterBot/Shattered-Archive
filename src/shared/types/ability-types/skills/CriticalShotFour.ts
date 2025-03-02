import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CriticalShotFour implements IAbility {
  private static instance: CriticalShotFour;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help critical4
BOWS ARROWS SHOOT CRITICAL1 CRITICAL2 CRITICAL3 CRITICAL4

Syntax: shoot direction target
        critical1 direction target
        critical2 direction target
        critical3 direction target
        critical4 direction target

Those deciding to practice with the bow require lessons in a number of
skills, as well as various pieces of equipment to make such practice useful.
Obviously, a bow is needed. As well though, one needs arrows that can be
fired, and a quiver to hold the arrows in when not in use.  

An arrow can be fired from a bow directly at a target, or from a distance,
ranged against an enemy farther away. Also, there are varying degrees of
critical damage that can be attempted when shooting an arrow toward an
enemy. Skill in these more damaging critical hits does not improve unless
lesser shooting skills have already been learned.  

To shoot an arrow, have your bow, and arrow ready, and type shoot target. 
Should you desire to range your shot, simply add the direction you wish to
aim, and fire away (shoot <direction> <target>). Obviously, should you wish
to attempt the more damaging critical hits, you may exchange the command
shoot with any of the critical commands.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (CriticalShotFour.instance === undefined) {
      CriticalShotFour.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CriticalShotFour {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CriticalShotFour.GetInstance() as T;
  }
}

export default CriticalShotFour;

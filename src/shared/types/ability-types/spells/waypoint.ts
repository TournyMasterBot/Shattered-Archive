import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Waypoint implements IAbility {
  private static instance: Waypoint;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Waypoint";
    this.helpFile = `help waypoint
waypoint
Syntax: cast 'waypoint'
        cast 'waypoint' recall

Waypoint is a spell of transportation that allows the caster to mark a room
and gate back to it for a period of time.  The waypoint weakens with each and
can be dispelled by other magics.  Only one waypoint may ever exist for a caster
at any one time.

A waypoint in rare circumstances may drift from its original point of origin.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Waypoint.instance === undefined) {
      Waypoint.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Waypoint {
    if (!Waypoint.instance) {
      Waypoint.instance = new Waypoint();
    }
    return Waypoint.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Waypoint.GetInstance() as T;
  }
}

export default Waypoint;

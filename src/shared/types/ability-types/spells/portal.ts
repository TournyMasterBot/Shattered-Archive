import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Portal implements IAbility {
  private static instance: Portal;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Portal'
Syntax: cast 'portal' <target>
The portal spell is similar to gate, but creates a lasting one-way portal to
the target creature, instead of transporting the caster.  Portals are
entered using 'enter' command, as in 'enter portal'.  Portals cannot be made
to certain destinations, nor used to escape from gate-proof rooms.  Portal
requires a special source of power to be used, unfortunately the secret of
this material component has been lost...  Portals can traverse the boundaries
of the continents.  Use look in <portal> to see destination.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Portal.instance === undefined) {
      Portal.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Portal {
    if (!Portal.instance) {
      Portal.instance = new Portal();
    }
    return Portal.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Portal.GetInstance() as T;
  }
}

export default Portal;

import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MassInvis implements IAbility {
  private static instance: MassInvis;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help mass invis
INVIS 'MASS INVIS' INVISIBILITY
INVIS 'MASS INVIS' INVISIBILITY

Syntax: cast 'invisibility' <character>
        cast 'invisibility' <object>
        cast 'mass invis'

The invisibility spell makes the target character invisible. Invisible
characters will become visible when they attack. It may also be cast on an
object to render the object invisible.  

The mass invisibility spell makes all characters in the caster's group
invisible, including the caster.  

See also - ILLUSION 
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (MassInvis.instance === undefined) {
      MassInvis.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MassInvis {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MassInvis.GetInstance() as T;
  }
}

export default MassInvis;

import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CorpseHost implements IAbility {
  private static instance: CorpseHost;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
CORPSE HOST

Syntax: c 'corpse host' corpse

Using the preserved host of a recently deceased creature, the caster can
transfer his life force into the corpse, and do his business through the
animated body of the victim.  

The Necromancer's actual body remains wherever he left it, in a state of
suspended animation, until the caster either returns voluntarily to his own
body, or the host corpse is destroyed.  

To return from a corpse you are hosting, you must 'incorporate'.  

See also - NECROMANCY NECROMANCER
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CorpseHost.instance === undefined) {
      CorpseHost.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CorpseHost {
    if (!CorpseHost.instance) {
      CorpseHost.instance = new CorpseHost();
    }
    return CorpseHost.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CorpseHost.GetInstance() as T;
  }
}

export default CorpseHost;

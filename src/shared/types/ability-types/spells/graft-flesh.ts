import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class GraftFlesh implements IAbility {
  private static instance: GraftFlesh;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
'GRAFT FLESH'

The 'graft flesh' spell can be used to raise an undead helper much like
animate dead. The difference is that grafted zombies hit hard but die
quick.

A necromancer that has all the body parts required can place them on the
ground and cast graft flesh to raise a grafted zombie. Due to the
intricacies of death and opposite charges and such you must have arms from
different enemies as well as legs.

See also - NECROMANCY NECROMANCER`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (GraftFlesh.instance === undefined) {
      GraftFlesh.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): GraftFlesh {
    if (!GraftFlesh.instance) {
      GraftFlesh.instance = new GraftFlesh();
    }
    return GraftFlesh.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GraftFlesh.GetInstance() as T;
  }
}

export default GraftFlesh;

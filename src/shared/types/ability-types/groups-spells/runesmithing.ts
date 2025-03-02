import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CreateRunestaff from "@shared/types/ability-types/spells/CreateRunestaff";
import SpellEating from "@shared/types/ability-types/spells/SpellEating";
import Furnace from "@shared/types/ability-types/spells/Furnace";
import CliathsHammer from "@shared/types/ability-types/spells/CliathsHammer";
import Courage from "@shared/types/ability-types/spells/Courage";
import Fortitude from "@shared/types/ability-types/spells/Fortitude";
import SureStriking from "@shared/types/ability-types/spells/SureStriking";
import IronGrip from "@shared/types/ability-types/spells/IronGrip";
import Damned from "@shared/types/ability-types/spells/Damned";
import Breaking from "@shared/types/ability-types/spells/Breaking";
import Destruction from "@shared/types/ability-types/spells/Destruction";
import CreateRunehammer from "@shared/types/ability-types/spells/CreateRunehammer";
import ServerCache from "@shared/cache/server-cache";

export class Runesmithing implements IAbilityGroup {
  static instance: Runesmithing;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Runesmithing;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CreateRunestaff.GetInstance(),
      SpellEating.GetInstance(),
      Furnace.GetInstance(),
      CliathsHammer.GetInstance(),
      Courage.GetInstance(),
      Fortitude.GetInstance(),
      SureStriking.GetInstance(),
      IronGrip.GetInstance(),
      Damned.GetInstance(),
      Breaking.GetInstance(),
      Destruction.GetInstance(),
      CreateRunehammer.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Runesmithing {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Runesmithing.GetInstance() as T;
  }
}

export default Runesmithing;

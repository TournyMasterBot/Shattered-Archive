import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Attack from "../groups-spells/Attack";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Creation from "../groups-spells/Creation";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Detection from "../groups-spells/Detection";
import Healing from "../groups-spells/Healing";
import Maladictions from "../groups-spells/Maladictions";
import Protective from "../groups-spells/Protective";
import Transportation from "../groups-spells/Transportation";
import Weather from "../groups-spells/Weather";
import Flail from "@shared/types/ability-types/skills/Flail";
import ServerCache from "@shared/cache/server-cache";

export class ClericDefault implements IAbilityGroup {
  static instance: ClericDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ClericDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Curative.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Attack.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Creation.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      Flail.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ClericDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ClericDefault.GetInstance() as T;
  }
}

export default ClericDefault;

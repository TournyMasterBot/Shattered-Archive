import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Detection from "../groups-spells/Detection";
import Healing from "../groups-spells/Healing";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Maladictions from "../groups-spells/Maladictions";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Illusion from "../groups-spells/Illusion";
import Protective from "../groups-spells/Protective";
import Transportation from "../groups-spells/Transportation";
import Creation from "../groups-spells/Creation";
import Weather from "../groups-spells/Weather";
import SecondAttack from "@shared/types/ability-types/skills/SecondAttack";
import HandToHand from "@shared/types/ability-types/skills/HandToHand";
import Focus from "@shared/types/ability-types/skills/Focus";
import ThirdAttack from "@shared/types/ability-types/skills/ThirdAttack";
import Swim from "@shared/types/ability-types/skills/Swim";
import FourthAttack from "@shared/types/ability-types/skills/FourthAttack";
import TimeStop from "@shared/types/ability-types/spells/TimeStop";
import BalanxBasics from "./BalanxBasics";
import View from "@shared/types/ability-types/spells/View";
import ServerCache from "@shared/cache/server-cache";

export class BalanxDefault implements IAbilityGroup {
  static instance: BalanxDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BalanxDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...BalanxBasics.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Creation.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      SecondAttack.GetInstance(),
      HandToHand.GetInstance(),
      Focus.GetInstance(),
      ThirdAttack.GetInstance(),
      TimeStop.GetInstance(),
      Swim.GetInstance(),
      FourthAttack.GetInstance(),
      View.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BalanxDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BalanxDefault.GetInstance() as T;
  }
}

export default BalanxDefault;

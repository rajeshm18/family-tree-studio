window.FT = window.FT || {};

FT.SAMPLE = (function () {
  'use strict';
  var people = {}, families = {};

  function P(id, given, surname, gender, bDate, bPlace, dDate, dPlace, nick) {
    people[id] = {
      id: id, given: given, surname: surname, nick: nick || '', gender: gender,
      birth: { date: bDate || '', place: bPlace || '' },
      death: { date: dDate || '', place: dPlace || '' },
      living: dDate ? false : true,
      photo: '', notes: '', tags: [], color: ''
    };
  }
  function F(id, partners, children, status, mDate, mPlace, childRel) {
    families[id] = {
      id: id, partners: partners, children: children,
      childRel: childRel || {},
      status: status || 'married',
      marriage: { date: mDate || '', place: mPlace || '' }
    };
  }

  // Generation 1
  P('p01', 'Ramlal', 'Sharma', 'M', '1920', 'Jaipur', '12 Mar 1995', 'Jaipur');
  P('p02', 'Kamla', 'Devi', 'F', '1925', 'Jodhpur', '2010', 'Jaipur');
  // Generation 2 (children of Ramlal & Kamla)
  P('p03', 'Suresh', 'Sharma', 'M', '1945', 'Jaipur');
  P('p04', 'Mahesh', 'Sharma', 'M', '1948', 'Jaipur');
  P('p05', 'Sunita', 'Verma', 'F', '1950', 'Jaipur');
  P('p06', 'Rakesh', 'Sharma', 'M', '1953', 'Jaipur');
  P('p07', 'Geeta', 'Iyer', 'F', '1956', 'Jaipur');
  // Spouses of generation 2
  P('p08', 'Meena', 'Sharma', 'F', '1948', 'Delhi');
  P('p11', 'Lata', 'Sharma', 'F', '1950', 'Kanpur', '1988', 'Jaipur');
  P('p13', 'Usha', 'Sharma', 'F', '1958', 'Agra');
  P('p15', 'Vikram', 'Verma', 'M', '1946', 'Lucknow', '4 Aug 2015', 'Lucknow');
  P('p18', 'Anjali', 'Sharma', 'F', '1957', 'Pune');
  P('p21', 'Prakash', 'Iyer', 'M', '1952', 'Chennai');
  // Generation 3
  P('p09', 'Vivek', 'Sharma', 'M', '8 Jun 1974', 'Delhi', '', '', 'Vicky');
  P('p10', 'Priya', 'Sharma', 'F', '1975', 'Delhi');
  P('p12', 'Anil', 'Sharma', 'M', '1974', 'Jaipur');
  P('p14', 'Neha', 'Sharma', 'F', '1985', 'Jaipur');
  P('p16', 'Karan', 'Verma', 'M', '1976', 'Lucknow');
  P('p17', 'Divya', 'Verma', 'F', '1979', 'Lucknow');
  P('p19', 'Rohan', 'Sharma', 'M', '1982', 'Mumbai');
  P('p20', 'Ishaan', 'Sharma', 'M', '1986', 'Mumbai');
  P('p22', 'Kavya', 'Iyer', 'F', '1983', 'Bangalore');
  // Married-in spouses of generation 3 and Pooja's parents
  P('p23', 'Pooja', 'Sharma', 'F', '1975', 'Ahmedabad');
  P('p26', 'Harish', 'Mehta', 'M', '1948', 'Ahmedabad', '2019', 'Ahmedabad');
  P('p27', 'Sheela', 'Mehta', 'F', '1952', 'Ahmedabad');
  P('p28', 'Nisha', 'Verma', 'F', '1980', 'Nagpur');
  P('p30', 'Ritu', 'Sharma', 'F', '1977', 'Indore');
  // Generation 4
  P('p24', 'Aditya', 'Sharma', 'M', '2002', 'Delhi');
  P('p25', 'Anaya', 'Sharma', 'F', '2006', 'Delhi');
  P('p29', 'Arjun', 'Verma', 'M', '2008', 'Pune');

  // a few richer details so the example shows what can be recorded
  Object.assign(people.p01, { gotra: 'Bharadwaj', native: 'Pushkar', altName: 'रामलाल शर्मा', notes: 'Started the family cloth shop in Johari Bazaar, Jaipur.' });
  Object.assign(people.p09, { gotra: 'Bharadwaj', native: 'Pushkar', altName: 'विवेक शर्मा', notes: 'Loves old family stories. Started this family tree.' });

  F('f01', ['p01', 'p02'], ['p03', 'p04', 'p05', 'p06', 'p07'], 'married', '1943', 'Jodhpur');
  F('f02', ['p03', 'p08'], ['p09', 'p10'], 'married', '1970', 'Delhi');
  // Mahesh: first marriage ended with Lata's death; second marriage to Usha (half-siblings Anil / Neha)
  F('f03', ['p04', 'p11'], ['p12'], 'widowed', '1972', 'Kanpur');
  F('f04', ['p04', 'p13'], ['p14'], 'married', '1983', 'Agra');
  F('f05', ['p05', 'p15'], ['p16', 'p17'], 'married', '1974', 'Lucknow');
  F('f06', ['p06', 'p18'], ['p19', 'p20'], 'married', '1980', 'Pune', { p20: 'adopted' });
  F('f07', ['p07', 'p21'], ['p22'], 'married', '1981', 'Chennai');
  F('f08', ['p09', 'p23'], ['p24', 'p25'], 'married', '2000', 'Ahmedabad');
  F('f09', ['p26', 'p27'], ['p23'], 'married', '1972', 'Ahmedabad');
  F('f10', ['p16', 'p28'], ['p29'], 'married', '2005', 'Nagpur');
  F('f11', ['p12', 'p30'], [], 'married', '2001', 'Indore');

  return {
    version: 1,
    meta: { title: 'The Sharma Family (example)', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
    people: people,
    families: families,
    settings: { view: 'hourglass', rootId: 'p09' }
  };
})();
